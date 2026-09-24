//! One interactive session, with bounded output held only in memory.
use crate::{integrations::Plan, jobs::Jobs};
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use serde::Serialize;
use std::{
    collections::VecDeque,
    io::{Read, Write},
    sync::{
        atomic::{AtomicBool, Ordering},
        mpsc, Arc, Mutex,
    },
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};

const LIMIT: usize = 1_000_000;
#[derive(Default)]
struct Buffer {
    bytes: VecDeque<u8>,
    end: u64,
}
impl Buffer {
    fn append(&mut self, bytes: &[u8]) {
        self.end += bytes.len() as u64;
        self.bytes.extend(bytes);
        let excess = self.bytes.len().saturating_sub(LIMIT);
        self.bytes.drain(..excess);
    }
    fn read(&self, cursor: u64) -> Output {
        let start = self.end - self.bytes.len() as u64;
        let cursor_valid = cursor >= start && cursor <= self.end;
        let offset = if cursor_valid {
            (cursor - start) as usize
        } else {
            0
        };
        let bytes: Vec<_> = self
            .bytes
            .iter()
            .skip(offset)
            .take(65536)
            .copied()
            .collect();
        Output {
            cursor: start + offset as u64 + bytes.len() as u64,
            bytes,
            truncated: !cursor_valid,
            running: false,
        }
    }
}
struct Session {
    id: String,
    master: Option<Box<dyn MasterPty + Send>>,
    input: Option<mpsc::SyncSender<Vec<u8>>>,
    buffer: Arc<Mutex<Buffer>>,
    running: bool,
}
#[derive(Clone, Default)]
pub struct Terminals(Arc<Mutex<Option<Session>>>);
#[derive(Serialize)]
pub struct Output {
    bytes: Vec<u8>,
    cursor: u64,
    truncated: bool,
    running: bool,
}

impl Terminals {
    fn output(&self, id: &str, cursor: u64) -> Result<Output, String> {
        let state = self.0.lock().map_err(|e| e.to_string())?;
        let session = state
            .as_ref()
            .filter(|s| s.id == id)
            .ok_or("Terminal output is no longer in memory. Activity retains the result only.")?;
        let mut output = session
            .buffer
            .lock()
            .map_err(|e| e.to_string())?
            .read(cursor);
        output.running = session.running;
        Ok(output)
    }
    fn write(&self, id: &str, data: &[u8]) -> Result<(), String> {
        if data.len() > 8192 {
            return Err("Terminal input is too large; paste a smaller chunk".into());
        }
        let state = self.0.lock().map_err(|e| e.to_string())?;
        let session = state
            .as_ref()
            .filter(|s| s.id == id && s.running)
            .ok_or("Terminal is not running")?;
        session
            .input
            .as_ref()
            .ok_or("Terminal input is closed")?
            .try_send(data.to_vec())
            .map_err(|error| match error {
                mpsc::TrySendError::Full(_) => {
                    "Terminal input is full; remaining paste was stopped. Wait before typing again."
                        .into()
                }
                mpsc::TrySendError::Disconnected(_) => "Terminal input is closed".into(),
            })
    }

    fn resize(&self, id: &str, cols: u16, rows: u16) -> Result<(), String> {
        if !(2..=500).contains(&cols) || !(2..=300).contains(&rows) {
            return Err("Invalid terminal dimensions".into());
        }
        let state = self.0.lock().map_err(|e| e.to_string())?;
        let session = state
            .as_ref()
            .filter(|s| s.id == id && s.running)
            .ok_or("Terminal is not running")?;
        session
            .master
            .as_ref()
            .ok_or("Terminal is closed")?
            .resize(PtySize {
                rows,
                cols,
                pixel_width: 0,
                pixel_height: 0,
            })
            .map_err(|e| e.to_string())
    }
    fn signal(&self, id: &str, pid: Option<u32>, signal: i32) {
        if let Ok(state) = self.0.lock() {
            if let Some(master) = state
                .as_ref()
                .filter(|s| s.id == id)
                .and_then(|s| s.master.as_ref())
            {
                if let Some(group) = master.process_group_leader().filter(|g| *g > 1) {
                    unsafe {
                        libc::kill(-group, signal);
                    }
                }
            }
        }
        if let Some(pid) = pid.filter(|p| *p > 1) {
            unsafe {
                libc::kill(-(pid as i32), signal);
            }
        }
    }
}

pub fn run(
    terminals: &Terminals,
    jobs: &Jobs,
    plan: &Plan,
    id: &str,
) -> (String, Option<i32>, String) {
    match execute(terminals, plan, id, || crate::jobs::cancelled(jobs, id)) {
        Ok((status, code)) => (
            status,
            Some(code),
            "Interactive workflow finished. Terminal output was not saved in Activity.\n".into(),
        ),
        Err(error) => (
            "failed".into(),
            None,
            format!("Could not run terminal: {error}"),
        ),
    }
}
fn execute(
    terminals: &Terminals,
    plan: &Plan,
    id: &str,
    cancelled: impl Fn() -> bool,
) -> Result<(String, i32), String> {
    let pair = native_pty_system()
        .openpty(PtySize {
            rows: 24,
            cols: 100,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;
    // Duplicated PTY handles share file flags. Keep both streams nonblocking so
    // a full input buffer or a surviving descendant cannot strand I/O threads.
    let fd = pair
        .master
        .as_raw_fd()
        .ok_or("PTY descriptor is unavailable")?;
    let flags = unsafe { libc::fcntl(fd, libc::F_GETFL) };
    if flags == -1 || unsafe { libc::fcntl(fd, libc::F_SETFL, flags | libc::O_NONBLOCK) } == -1 {
        return Err(std::io::Error::last_os_error().to_string());
    }
    let mut reader = pair.master.try_clone_reader().map_err(|e| e.to_string())?;
    let mut writer = pair.master.take_writer().map_err(|e| e.to_string())?;
    let mut command = CommandBuilder::new(&plan.program);
    command.args(&plan.args);
    command.cwd(&plan.cwd);
    command.env("TERM", "xterm-256color");
    command.env("COLORTERM", "truecolor");
    command.env_remove("NO_COLOR");
    let buffer = Arc::new(Mutex::new(Buffer::default()));
    let closed = Arc::new(AtomicBool::new(false));
    let (input_tx, input_rx) = mpsc::sync_channel::<Vec<u8>>(64);
    // Acquire state before spawning so a poisoned lock cannot orphan a child.
    let mut state = terminals.0.lock().map_err(|e| e.to_string())?;
    let mut child = pair
        .slave
        .spawn_command(command)
        .map_err(|e| e.to_string())?;
    drop(pair.slave);
    let pid = child.process_id();
    *state = Some(Session {
        id: id.into(),
        master: Some(pair.master),
        input: Some(input_tx),
        buffer: buffer.clone(),
        running: true,
    });
    drop(state);
    let writer_closed = closed.clone();
    let input_thread = thread::spawn(move || {
        'input: while !writer_closed.load(Ordering::Relaxed) {
            let bytes = match input_rx.recv_timeout(Duration::from_millis(40)) {
                Ok(bytes) => bytes,
                Err(mpsc::RecvTimeoutError::Timeout) => continue,
                Err(_) => break,
            };
            let mut offset = 0;
            while offset < bytes.len() && !writer_closed.load(Ordering::Relaxed) {
                match writer.write(&bytes[offset..]) {
                    Ok(0) => break 'input,
                    Ok(n) => offset += n,
                    Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                        thread::sleep(Duration::from_millis(10))
                    }
                    Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                    Err(_) => break 'input,
                }
            }
        }
    });
    let (done_tx, done_rx) = mpsc::channel();
    let reader_closed = closed.clone();
    let output_thread = thread::spawn(move || {
        let mut bytes = [0; 8192];
        while !reader_closed.load(Ordering::Relaxed) {
            match reader.read(&mut bytes) {
                Ok(0) => break,
                Ok(n) => {
                    if let Ok(mut buffer) = buffer.lock() {
                        buffer.append(&bytes[..n]);
                    }
                }
                Err(error) if error.kind() == std::io::ErrorKind::WouldBlock => {
                    thread::sleep(Duration::from_millis(10))
                }
                Err(error) if error.kind() == std::io::ErrorKind::Interrupted => continue,
                Err(_) => break,
            }
        }
        let _ = done_tx.send(());
    });
    let start = Instant::now();
    let mut stopped = None;
    let result = loop {
        if cancelled() || start.elapsed() > Duration::from_secs(plan.timeout_seconds) {
            stopped = Some(if cancelled() {
                "cancelled"
            } else {
                "timed-out"
            });
            terminals.signal(id, pid, libc::SIGTERM);
            thread::sleep(Duration::from_millis(300));
            terminals.signal(id, pid, libc::SIGKILL);
            let _ = child.kill();
            break child.wait();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(40)),
            Err(error) => {
                terminals.signal(id, pid, libc::SIGKILL);
                let _ = child.kill();
                let _ = child.wait();
                break Err(error);
            }
        }
    };
    // Kill surviving process-group children and close the PTY even on failure.
    terminals.signal(id, pid, libc::SIGKILL);
    let _ = done_rx.recv_timeout(Duration::from_millis(300));
    closed.store(true, Ordering::Relaxed);
    let _ = input_thread.join();
    let _ = output_thread.join();
    if let Ok(mut state) = terminals.0.lock() {
        if let Some(session) = state.as_mut().filter(|s| s.id == id) {
            session.running = false;
            session.input.take();
            session.master.take();
        }
    }
    result
        .map(|status| {
            (
                stopped
                    .unwrap_or(if status.success() {
                        "succeeded"
                    } else {
                        "failed"
                    })
                    .into(),
                status.exit_code() as i32,
            )
        })
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn terminal_read(
    terminals: State<Terminals>,
    id: String,
    cursor: u64,
) -> Result<Output, String> {
    terminals.output(&id, cursor)
}
#[tauri::command]
pub async fn terminal_write(
    app: tauri::AppHandle,
    id: String,
    data: Vec<u8>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || app.state::<Terminals>().write(&id, &data))
        .await
        .map_err(|e| e.to_string())?
}
#[tauri::command]
pub fn terminal_resize(
    terminals: State<Terminals>,
    id: String,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    terminals.resize(&id, cols, rows)
}
#[tauri::command]
pub fn terminal_export(
    app: tauri::AppHandle,
    terminals: State<Terminals>,
    id: String,
) -> Result<String, String> {
    let state = terminals.0.lock().map_err(|e| e.to_string())?;
    let session = state
        .as_ref()
        .filter(|s| s.id == id)
        .ok_or("Output is no longer in memory")?;
    let buffer = session.buffer.lock().map_err(|e| e.to_string())?;
    let path = crate::platform::data_file(
        &app,
        &format!("toolbox-output-{}.txt", crate::platform::now()),
    )?;
    let mut output = format!("Command Center: explicitly saved terminal output. Older bytes may be omitted (limit {LIMIT}).\n\n").into_bytes();
    output.extend(buffer.bytes.iter());
    crate::platform::atomic_write(&path, &output)?;
    Ok(path.to_string_lossy().into_owned())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn buffer_is_bounded_and_resumes_without_duplicates() {
        let mut buffer = Buffer::default();
        buffer.append(&vec![42; LIMIT + 3]);
        let first = buffer.read(0);
        assert!(first.truncated);
        assert_eq!(first.bytes.len(), 65536);
        assert_eq!(first.cursor, 65539);
        assert!(!buffer.read(first.cursor).truncated);
        assert!(buffer.read(buffer.end).bytes.is_empty());
    }
    #[test]
    fn interactive_tty_accepts_input_resizes_and_never_uses_activity_logs() {
        let terminals = Terminals::default();
        let worker = terminals.clone();
        let plan = Plan::new("Test", "/bin/sh", vec!["-c".into(), "test -t 0 && printf ready; read answer; stty size; printf 'answer:%s' \"$answer\"; exit 7".into()], std::path::Path::new("/tmp"));
        let task = thread::spawn(move || execute(&worker, &plan, "test", || false));
        let start = Instant::now();
        while !terminals
            .output("test", 0)
            .is_ok_and(|o| String::from_utf8_lossy(&o.bytes).contains("ready"))
        {
            assert!(start.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(10));
        }
        assert!(terminals.write("wrong-id", b"oops").is_err());
        terminals.resize("test", 90, 32).unwrap();
        terminals.write("test", b"hello\n").unwrap();
        assert_eq!(task.join().unwrap().unwrap(), ("failed".into(), 7));
        let output = terminals.output("test", 0).unwrap();
        let text = String::from_utf8_lossy(&output.bytes);
        assert!(
            text.contains("32 90") && text.contains("answer:hello"),
            "{text}"
        );
        assert!(!output.running);
        assert!(terminals.write("test", b"late").is_err());
    }
    #[test]
    fn cancellation_remains_available_when_input_is_backpressured() {
        use std::sync::atomic::{AtomicBool, Ordering};
        let terminals = Terminals::default();
        let worker = terminals.clone();
        let cancel = Arc::new(AtomicBool::new(false));
        let worker_cancel = cancel.clone();
        let plan = Plan::new(
            "Test",
            "/bin/sh",
            vec![
                "-c".into(),
                "stty -echo -icanon; printf ready; sleep 30".into(),
            ],
            std::path::Path::new("/tmp"),
        );
        let task = thread::spawn(move || {
            execute(&worker, &plan, "paste", || {
                worker_cancel.load(Ordering::Relaxed)
            })
        });
        let start = Instant::now();
        while !terminals
            .output("paste", 0)
            .is_ok_and(|o| String::from_utf8_lossy(&o.bytes).contains("ready"))
        {
            assert!(start.elapsed() < Duration::from_secs(5));
            thread::sleep(Duration::from_millis(10));
        }
        let writer = terminals.clone();
        let paste = thread::spawn(move || {
            for _ in 0..128 {
                if writer.write("paste", &[b'x'; 8192]).is_err() {
                    break;
                }
            }
        });
        thread::sleep(Duration::from_millis(80));
        cancel.store(true, Ordering::Relaxed);
        assert_eq!(task.join().unwrap().unwrap().0, "cancelled");
        paste.join().unwrap();
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[test]
    fn interactive_workflow_can_be_cancelled() {
        let terminals = Terminals::default();
        let plan = Plan::new(
            "Test",
            "/bin/sh",
            vec!["-c".into(), "sleep 30 & wait".into()],
            std::path::Path::new("/tmp"),
        );
        let start = Instant::now();
        let result = execute(&terminals, &plan, "stop", || {
            start.elapsed() > Duration::from_millis(80)
        })
        .unwrap();
        assert_eq!(result.0, "cancelled");
        assert!(start.elapsed() < Duration::from_secs(3));
        assert!(!terminals.output("stop", 0).unwrap().running);
    }
}
