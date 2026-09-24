use crate::{
    integrations::{self, Plan, Request},
    platform as p,
};
use serde::{Deserialize, Serialize};
use std::{
    collections::BTreeMap,
    fs,
    io::Read,
    os::unix::process::CommandExt,
    process::Stdio,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};
use tauri::{Manager, State};
const OUTPUT_LIMIT: usize = 2_000_000;
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Job {
    pub id: String,
    pub action: String,
    #[serde(default)]
    pub tool_id: String,
    #[serde(default)]
    pub toolbox_revision: String,
    pub title: String,
    pub command: String,
    pub cwd: String,
    pub status: String,
    pub started_at: u64,
    pub finished_at: Option<u64>,
    pub output: String,
    #[serde(default)]
    pub result: String,
    pub exit_code: Option<i32>,
    pub truncated: bool,
    pub external_terminal: bool,
    #[serde(default)]
    pub interactive: bool,
    pub acknowledged: bool,
}
/// A started job and the resources it holds until it finishes.
struct Running {
    title: String,
    locks: Vec<String>,
    cancel: bool,
}
#[derive(Default)]
pub struct Inner {
    jobs: Vec<Job>,
    plans: BTreeMap<String, (Plan, Request, Instant)>,
    running: BTreeMap<String, Running>,
    initialized: bool,
    persistence_error: Option<String>,
    close_requested: bool,
}
#[derive(Clone, Default)]
pub struct Jobs(pub Arc<Mutex<Inner>>);
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct History {
    jobs: Vec<Job>,
    persistence_error: Option<String>,
    close_requested: bool,
}
fn persist(app: &tauri::AppHandle, state: &mut Inner) {
    state.persistence_error = p::data_file(app, "activity.json")
        .and_then(|path| p::save(&path, &state.jobs))
        .err();
}
fn initialize(app: &tauri::AppHandle, state: &mut Inner) -> Result<(), String> {
    if !state.initialized {
        state.jobs = p::load(&p::data_file(app, "activity.json")?)?;
        for job in &mut state.jobs {
            if job.status == "running" {
                job.status = "interrupted".into();
                job.finished_at = Some(p::now());
                job.output.push_str("\nApp restarted; completion could not be confirmed. Check the external command before retrying.\n");
            }
        }
        state.initialized = true;
    }
    Ok(())
}
fn active(state: &Inner) -> bool {
    state.jobs.iter().any(|j| j.status == "running")
}
const REPOSITORY_ACTIONS: [&str; 13] = [
    "stage", "stage-all", "unstage", "commit", "branch-create", "branch-switch",
    "stash-create", "stash-apply", "branch-publish", "fetch", "pull", "push", "project-task",
];
/// Jobs run concurrently unless they share a resource: the same working directory,
/// the workstation (every non-repository action), or the embedded terminal.
fn locks(request: &Request, plan: &Plan) -> Vec<String> {
    let mut locks = vec![format!("directory:{}", plan.cwd)];
    if !REPOSITORY_ACTIONS.contains(&request.action.as_str()) {
        locks.push("system".into());
    }
    if plan.interactive && !plan.external_terminal {
        locks.push("terminal".into());
    }
    locks
}
fn conflict(state: &Inner, locks: &[String]) -> Result<(), String> {
    for job in state.running.values() {
        if let Some(lock) = job.locks.iter().find(|l| locks.contains(l)) {
            let reason = match lock.as_str() {
                "system" => "Workstation tasks run one at a time".to_string(),
                "terminal" => "The embedded terminal is in use".to_string(),
                _ => format!("It uses the same folder ({})", &lock["directory:".len()..]),
            };
            return Err(format!("Wait for “{}” to finish. {reason}.", job.title));
        }
    }
    Ok(())
}
#[tauri::command]
pub fn job_history(
    app: tauri::AppHandle,
    jobs: State<Jobs>,
    selected_id: Option<String>,
) -> Result<History, String> {
    let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
    initialize(&app, &mut state)?;
    let mut history = state.jobs.clone();
    for job in &mut history {
        job.result.clear();
        if selected_id.as_ref() != Some(&job.id) {
            job.output.clear();
        }
    }
    let close_requested = state.close_requested;
    state.close_requested = false;
    Ok(History {
        jobs: history,
        persistence_error: state.persistence_error.clone(),
        close_requested,
    })
}
#[tauri::command]
pub async fn prepare_job(app: tauri::AppHandle, request: Request) -> Result<Plan, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let s = crate::settings::load_settings(app.clone())?.unwrap_or_default();
        let mut plan = build_plan(&app, &request, &s)?;
        let jobs = app.state::<Jobs>();
        let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
        initialize(&app, &mut state)?;
        conflict(&state, &locks(&request, &plan))?;
        state
            .plans
            .retain(|_, (_, _, created)| created.elapsed() < Duration::from_secs(300));
        plan.id = format!("{}-{}", p::now(), state.plans.len());
        if state.plans.len() > 20 {
            state.plans.clear();
        }
        state
            .plans
            .insert(plan.id.clone(), (plan.clone(), request, Instant::now()));
        Ok(plan)
    })
    .await
    .map_err(|e| e.to_string())?
}
#[tauri::command]
pub async fn start_job(app: tauri::AppHandle, id: String) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let _setup_guard = crate::setup::WRITE_LOCK.lock().map_err(|e| e.to_string())?;
        let jobs = app.state::<Jobs>().inner().clone();
        let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
        let (plan, request, created) = state
            .plans
            .remove(&id)
            .ok_or("Review this action again before starting it")?;
        if created.elapsed() > Duration::from_secs(300) {
            return Err("Action preview expired; review it again".into());
        }
        drop(state);
        // Recheck mutable preconditions off the UI thread without holding the activity lock.
        let settings = crate::settings::load_settings(app.clone())?.unwrap_or_default();
        let current = build_plan(&app, &request, &settings)?;
        if current.args != plan.args || current.program != plan.program || current.cwd != plan.cwd || current.interactive != plan.interactive || current.external_terminal != plan.external_terminal {
            return Err("Settings changed; review the action again".into());
        }
        let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
        let held = locks(&request, &plan);
        conflict(&state, &held)?;
        if let Some(target) = &plan.create_target {
            integrations::validate_restore_target(std::path::Path::new(target))?;
            fs::create_dir(target).map_err(|e| e.to_string())?;
        }
        state.running.insert(
            id.clone(),
            Running { title: plan.title.clone(), locks: held, cancel: false },
        );
        crate::desktop_status::status(&app, &running_status(state.running.len()));
        let command = shell_words::join(
            std::iter::once(plan.program.as_str()).chain(plan.args.iter().map(String::as_str)),
        );
        state.jobs.insert(
            0,
            Job {
                id: id.clone(),
                tool_id: request.tool_id,
                toolbox_revision: if request.action == "toolbox" {
                    crate::toolbox::REVISION.into()
                } else {
                    String::new()
                },
                action: request.action,
                title: plan.title.clone(),
                command,
                cwd: plan.cwd.clone(),
                status: "running".into(),
                started_at: p::now(),
                finished_at: None,
                output: String::new(),
                result: String::new(),
                exit_code: None,
                truncated: false,
                external_terminal: plan.external_terminal,
                interactive: plan.interactive,
                acknowledged: false,
            },
        );
        state.jobs.truncate(100);
        persist(&app, &mut state);
        drop(state);
        let response = id.clone();
        thread::spawn(move || run(app, jobs, plan, id, settings.terminal));
        Ok(response)
    })
    .await
    .map_err(|e| e.to_string())?
}
pub(crate) fn build_plan(
    app: &tauri::AppHandle,
    request: &Request,
    settings: &crate::settings::Settings,
) -> Result<Plan, String> {
    let mut configured=settings.clone();
    if !request.profile_id.is_empty() {
        let collection=crate::operations::load_operations(app.clone())?;
        let profile=collection.profiles.iter().find(|p|p.id==request.profile_id).ok_or("Machine profile no longer exists")?;
        if !profile.dotfiles_path.is_empty(){ configured.integrations.dotfiles_path=profile.dotfiles_path.clone(); }
        if !profile.flake_profile.is_empty(){ configured.integrations.flake_profile=profile.flake_profile.clone(); }
    }
    let settings=&configured;
    if ["personal-tool","recovery-test","profile-clone","backup-ready","health-check"].contains(&request.action.as_str()) {
        settings.validate()?;
        crate::operations::plan(app,request,settings)
    } else if request.action == "project-task" {
        crate::workspace::task_plan(app, request)
    } else if request.action == "toolbox" {
        settings.validate()?;
        app.state::<crate::toolbox::Toolbox>().plan(request)
    } else {
        integrations::build_plan(request, settings)
    }
}
fn running_status(count: usize) -> String {
    match count {
        1 => "Command Center · Task running".into(),
        n => format!("Command Center · {n} tasks running"),
    }
}
pub(crate) fn cancelled(jobs: &Jobs, id: &str) -> bool {
    jobs.0
        .lock()
        .map(|s| s.running.get(id).is_none_or(|r| r.cancel))
        .unwrap_or(true)
}
fn append(jobs: &Jobs, id: &str, text: &str) {
    if let Ok(mut state) = jobs.0.lock() {
        if let Some(job) = state.jobs.iter_mut().find(|j| j.id == id) {
            let available = OUTPUT_LIMIT.saturating_sub(job.output.len());
            let mut take = available.min(text.len());
            while !text.is_char_boundary(take) {
                take -= 1;
            }
            job.output.push_str(&text[..take]);
            if take < text.len() {
                job.truncated = true;
            }
        }
    }
}
fn reader<T: Read + Send + 'static>(
    mut stream: T,
    jobs: Jobs,
    id: String,
    stdout: bool,
) -> thread::JoinHandle<()> {
    thread::spawn(move || {
        let mut buffer = [0; 4096];
        let mut pending = Vec::new();
        loop {
            let n = stream.read(&mut buffer).unwrap_or(0);
            pending.extend_from_slice(&buffer[..n]);
            let mut consumed = 0;
            while consumed < pending.len() {
                let remaining = &pending[consumed..];
                let (text, used) = match std::str::from_utf8(remaining) {
                    Ok(text) => (text.to_owned(), remaining.len()),
                    Err(error) if error.valid_up_to() > 0 => (
                        String::from_utf8_lossy(&remaining[..error.valid_up_to()]).into_owned(),
                        error.valid_up_to(),
                    ),
                    Err(error) => match error.error_len() {
                        Some(len) => ("�".into(), len),
                        None if n == 0 => ("�".into(), remaining.len()),
                        None => break,
                    },
                };
                append(&jobs, &id, &text);
                if stdout {
                    if let Ok(mut state) = jobs.0.lock() {
                        if let Some(job) = state.jobs.iter_mut().find(|j| j.id == id) {
                            if ["snapshots", "snapshot-files"].contains(&job.action.as_str())
                                && job.result.len() + text.len() <= OUTPUT_LIMIT
                            {
                                job.result.push_str(&text);
                            }
                        }
                    }
                }
                consumed += used;
            }
            pending.drain(..consumed);
            if n == 0 {
                break;
            }
        }
    })
}

fn finish(
    app: &tauri::AppHandle,
    jobs: &Jobs,
    id: &str,
    status: &str,
    code: Option<i32>,
    message: &str,
) {
    append(jobs, id, message);
    crate::desktop_status::job_finished(app,status);
    if let Ok(mut state) = jobs.0.lock() {
        state.running.remove(id);
        if !state.running.is_empty() {
            crate::desktop_status::status(app, &running_status(state.running.len()));
        }
        if let Some(job) = state.jobs.iter_mut().find(|j| j.id == id) {
            job.status = status.into();
            job.exit_code = code;
            job.finished_at = Some(p::now());
        }
        persist(app, &mut state);
    }
}
fn run(app: tauri::AppHandle, jobs: Jobs, plan: Plan, id: String, terminal: String) {
    if plan.external_terminal {
        let result = (|| -> Result<std::path::PathBuf, String> {
            let receipt = p::data_file(&app, &format!("receipts/{id}"))?;
            fs::create_dir_all(receipt.parent().ok_or("Invalid receipt path")?)
                .map_err(|e| e.to_string())?;
            // Literal positional arguments; user paths are never inserted into shell code.
            let shell="receipt=$1; shift; \"$@\"; code=$?; printf '%s\\n' \"$code\" > \"$receipt\"; printf '\\nCommand finished (exit %s). Press Enter to close.\\n' \"$code\"; read answer; exit \"$code\"";
            let mut args = vec![
                std::ffi::OsString::from("sh"),
                "-c".into(),
                shell.into(),
                "command-center".into(),
                receipt.as_os_str().to_owned(),
                plan.program.clone().into(),
            ];
            args.extend(plan.args.iter().map(Into::into));
            crate::launcher::run_in_terminal(std::path::Path::new(&plan.cwd), &args, &terminal)?;
            Ok(receipt)
        })();
        match result {
            Err(e) => finish(&app, &jobs, &id, "failed", None, &e),
            Ok(receipt) => {
                append(&jobs,&id,"Opened your terminal for this interactive workflow. Input and output stay in that terminal.\n");
                let start = Instant::now();
                loop {
                    if let Ok(text) = fs::read_to_string(&receipt) {
                        if let Ok(code) = text.trim().parse::<i32>() {
                            finish(
                                &app,
                                &jobs,
                                &id,
                                if code == 0 { "succeeded" } else { "failed" },
                                Some(code),
                                "\nTerminal workflow finished.\n",
                            );
                            let _ = fs::remove_file(receipt);
                            break;
                        }
                    }
                    if jobs
                        .0
                        .lock()
                        .map(|state| {
                            state
                                .jobs
                                .iter()
                                .any(|j| j.id == id && j.status != "running")
                        })
                        .unwrap_or(true)
                    {
                        break;
                    }
                    if start.elapsed() > Duration::from_secs(plan.timeout_seconds) {
                        finish(
                            &app,
                            &jobs,
                            &id,
                            "interrupted",
                            None,
                            "\nCompletion not confirmed. Check the terminal before retrying.\n",
                        );
                        break;
                    }
                    thread::sleep(Duration::from_secs(1));
                }
            }
        }
        return;
    }
    let (status, code, message) = if plan.interactive {
        crate::terminal::run(
            &app.state::<crate::terminal::Terminals>(),
            &jobs,
            &plan,
            &id,
        )
    } else {
        run_process(jobs.clone(), plan, id.clone())
    };
    finish(&app, &jobs, &id, &status, code, &message);
}
fn run_process(jobs: Jobs, plan: Plan, id: String) -> (String, Option<i32>, String) {
    let mut cmd = plan.command();
    cmd.stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0);
    let mut child = match cmd.spawn() {
        Ok(c) => c,
        Err(e) => {
            return ("failed".into(), None, format!("Could not start: {e}"));
        }
    };
    let stdout = reader(child.stdout.take().unwrap(), jobs.clone(), id.clone(), true);
    let stderr = reader(
        child.stderr.take().unwrap(),
        jobs.clone(),
        id.clone(),
        false,
    );
    let start = Instant::now();
    let mut stopped = None;
    let status = loop {
        let cancel = cancelled(&jobs, &id);
        if cancel || start.elapsed() > Duration::from_secs(plan.timeout_seconds) {
            stopped = Some(if cancel { "cancelled" } else { "timed-out" });
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGTERM);
            }
            thread::sleep(Duration::from_millis(300));
            unsafe {
                libc::kill(-(child.id() as i32), libc::SIGKILL);
            }
            break child.wait();
        }
        match child.try_wait() {
            Ok(Some(status)) => break Ok(status),
            Ok(None) => thread::sleep(Duration::from_millis(80)),
            Err(e) => {
                unsafe {
                    libc::kill(-(child.id() as i32), libc::SIGKILL);
                }
                let _ = child.wait();
                break Err(e);
            }
        }
    };
    unsafe {
        libc::kill(-(child.id() as i32), libc::SIGKILL);
    }
    let _ = stdout.join();
    let _ = stderr.join();
    match status {
        Ok(status) => (
            stopped
                .unwrap_or(if status.success() {
                    "succeeded"
                } else {
                    "failed"
                })
                .into(),
            status.code(),
            if stopped.is_some() {
                "\nJob stopped. Review partial changes before retrying.\n".into()
            } else {
                String::new()
            },
        ),
        Err(e) => ("failed".into(), None, e.to_string()),
    }
}

#[tauri::command]
pub fn cancel_job(id: String, jobs: State<Jobs>) -> Result<(), String> {
    let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
    let job = state
        .jobs
        .iter()
        .find(|j| j.id == id)
        .ok_or("Job not found")?;
    if job.status != "running" {
        return Err("Job has already finished".into());
    }
    if job.external_terminal {
        return Err("Stop this workflow in its terminal".into());
    }
    state
        .running
        .get_mut(&id)
        .ok_or("Job has already finished")?
        .cancel = true;
    Ok(())
}
#[tauri::command]
pub fn acknowledge_job(app: tauri::AppHandle, id: String, jobs: State<Jobs>) -> Result<(), String> {
    let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
    let job = state
        .jobs
        .iter_mut()
        .find(|j| j.id == id)
        .ok_or("Job not found")?;
    job.acknowledged = true;
    persist(&app, &mut state);
    Ok(())
}

#[tauri::command]
pub fn job_result(id: String, jobs: State<Jobs>) -> Result<Job, String> {
    jobs.0
        .lock()
        .map_err(|e| e.to_string())?
        .jobs
        .iter()
        .find(|j| j.id == id)
        .cloned()
        .ok_or_else(|| "Job not found".into())
}
#[tauri::command]
pub fn stop_terminal_monitor(
    app: tauri::AppHandle,
    id: String,
    jobs: State<Jobs>,
) -> Result<(), String> {
    {
        let state = jobs.0.lock().map_err(|e| e.to_string())?;
        let job = state
            .jobs
            .iter()
            .find(|j| j.id == id)
            .ok_or("Job not found")?;
        if !job.external_terminal || job.status != "running" {
            return Err("No terminal workflow is being monitored".into());
        }
    }
    finish(&app, &jobs, &id, "interrupted", None, "\nMonitoring stopped by user. Completion was not verified; check the terminal before running another workflow.\n");
    Ok(())
}
pub fn prevent_close(app: &tauri::AppHandle) -> bool {
    let jobs = app.state::<Jobs>();
    if let Ok(mut state) = jobs.0.lock() {
        if active(&state) {
            state.close_requested = true;
            return true;
        }
    }
    false
}
pub(crate) fn require_idle(app: &tauri::AppHandle) -> Result<(), String> {
    let jobs = app.state::<Jobs>();
    let mut state = jobs.0.lock().map_err(|e| e.to_string())?;
    initialize(app, &mut state)?;
    if active(&state) { return Err("Finish the running job before importing a setup".into()); }
    state.plans.clear();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    fn fixture() -> Jobs {
        let jobs = Jobs::default();
        jobs.0.lock().unwrap().jobs.push(Job {
            id: "fixture".into(),
            action: "snapshots".into(),
            tool_id: String::new(),
            toolbox_revision: String::new(),
            title: "Fixture".into(),
            command: String::new(),
            cwd: "/tmp".into(),
            status: "running".into(),
            started_at: p::now(),
            finished_at: None,
            output: String::new(),
            result: String::new(),
            exit_code: None,
            truncated: false,
            external_terminal: false,
            interactive: false,
            acknowledged: false,
        });
        jobs.0.lock().unwrap().running.insert(
            "fixture".into(),
            Running { title: "Fixture".into(), locks: vec![], cancel: false },
        );
        jobs
    }
    fn plan(script: &str) -> Plan {
        Plan {
            id: "fixture".into(),
            title: "Fixture".into(),
            program: "sh".into(),
            args: vec!["-c".into(), script.into()],
            cwd: "/tmp".into(),
            explanation: String::new(),
            timeout_seconds: 10,
            external_terminal: false,
            interactive: false,
            create_target: None,
        }
    }
    #[test]
    fn streams_output_and_keeps_machine_results_separate_from_stderr() {
        let jobs = fixture();
        let (status, code, _) = run_process(
            jobs.clone(),
            plan("printf '[1,2]'; printf diagnostic >&2"),
            "fixture".into(),
        );
        assert_eq!(status, "succeeded");
        assert_eq!(code, Some(0));
        let state = jobs.0.lock().unwrap();
        assert_eq!(state.jobs[0].result, "[1,2]");
        assert!(state.jobs[0].output.contains("diagnostic"));
    }
    #[test]
    fn running_process_can_be_cancelled() {
        let jobs = fixture();
        let worker = jobs.clone();
        let handle = thread::spawn(move || {
            run_process(
                worker,
                plan("printf started; sleep 30 & wait"),
                "fixture".into(),
            )
        });
        let start = Instant::now();
        loop {
            if jobs.0.lock().unwrap().jobs[0].output.contains("started") {
                break;
            }
            assert!(start.elapsed() < Duration::from_secs(3));
            thread::sleep(Duration::from_millis(20));
        }
        jobs.0.lock().unwrap().running.get_mut("fixture").unwrap().cancel = true;
        let (status, _, _) = handle.join().unwrap();
        assert_eq!(status, "cancelled");
        assert!(start.elapsed() < Duration::from_secs(3));
    }
    #[test]
    fn unicode_survives_split_read_boundaries() {
        struct Bytes(std::io::Cursor<Vec<u8>>);
        impl Read for Bytes {
            fn read(&mut self, b: &mut [u8]) -> std::io::Result<usize> {
                self.0.read(&mut b[..1])
            }
        }
        let jobs = fixture();
        reader(
            Bytes(std::io::Cursor::new("éλ📁".as_bytes().to_vec())),
            jobs.clone(),
            "fixture".into(),
            true,
        )
        .join()
        .unwrap();
        assert_eq!(jobs.0.lock().unwrap().jobs[0].output, "éλ📁");
    }
    #[test]
    fn oversized_logs_are_bounded_and_marked() {
        let jobs = fixture();
        append(&jobs, "fixture", &"x".repeat(OUTPUT_LIMIT + 30));
        let state = jobs.0.lock().unwrap();
        assert_eq!(state.jobs[0].output.len(), OUTPUT_LIMIT);
        assert!(state.jobs[0].truncated);
    }

    #[test]
    fn jobs_run_concurrently_unless_they_share_a_folder_the_workstation_or_terminal() {
        let request = |action: &str| Request { action: action.into(), ..Default::default() };
        let at = |cwd: &str, interactive: bool| Plan { cwd: cwd.into(), interactive, ..plan("true") };
        let mut state = Inner::default();
        let task = locks(&request("project-task"), &at("/repo/a", false));
        state.running.insert("task".into(), Running { title: "npm · build".into(), locks: task, cancel: false });
        // Another repository, and a workstation task, may run alongside it.
        assert!(conflict(&state, &locks(&request("fetch"), &at("/repo/b", false))).is_ok());
        let backup = locks(&request("backup"), &at("/home", false));
        assert!(conflict(&state, &backup).is_ok());
        // The same repository waits.
        let error = conflict(&state, &locks(&request("commit"), &at("/repo/a", false))).unwrap_err();
        assert!(error.contains("npm · build") && error.contains("/repo/a"));
        state.running.insert("backup".into(), Running { title: "Backup".into(), locks: backup, cancel: false });
        let error = conflict(&state, &locks(&request("hm-switch"), &at("/dotfiles", false))).unwrap_err();
        assert!(error.contains("one at a time"));
        state.running.remove("backup");
        let toolbox = locks(&request("toolbox"), &at("/scripts", true));
        state.running.insert("toolbox".into(), Running { title: "Installer".into(), locks: toolbox, cancel: false });
        let error = conflict(&state, &locks(&request("project-task"), &at("/repo/c", true))).unwrap_err();
        assert!(error.contains("terminal is in use"));
        let external = Plan { external_terminal: true, ..at("/repo/c", true) };
        assert!(conflict(&state, &locks(&request("project-task"), &external)).is_ok());
    }
    #[test]
    fn cancelling_one_job_leaves_others_running() {
        let jobs = fixture();
        jobs.0.lock().unwrap().running.insert(
            "other".into(),
            Running { title: "Other".into(), locks: vec![], cancel: false },
        );
        jobs.0.lock().unwrap().running.get_mut("other").unwrap().cancel = true;
        assert!(cancelled(&jobs, "other"));
        assert!(!cancelled(&jobs, "fixture"));
        assert!(cancelled(&jobs, "finished"), "unknown jobs are never resumed");
    }
}
