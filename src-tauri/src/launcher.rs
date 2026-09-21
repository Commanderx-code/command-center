//! Linux application launch policy. No shell evaluates configured command strings.
use std::{env, ffi::OsString, path::{Path, PathBuf}, process::{Command, Stdio}, thread, time::Duration};

fn start(mut command: Command) -> Result<(), String> {
    // Detect immediate failures; reap long-lived GUI processes off the UI thread.
    command.stdin(Stdio::null());
    let mut child = command.spawn().map_err(|e| e.to_string())?;
    for _ in 0..10 {
        match child.try_wait().map_err(|e| e.to_string())? {
            Some(status) if status.success() => return Ok(()),
            Some(status) => return Err(format!("Launcher exited with {status}; see the app terminal for details")),
            None => thread::sleep(Duration::from_millis(25)),
        }
    }
    thread::spawn(move || { let _ = child.wait(); });
    Ok(())
}

fn configured(value: &str) -> Result<Vec<OsString>, String> {
    let words = shell_words::split(value).map_err(|e| e.to_string())?;
    if words.is_empty() { return Err("Empty application command".into()); }
    Ok(words.into_iter().map(OsString::from).collect())
}

fn terminal_command(words: &[OsString], path: &Path, child: &[OsString]) -> Command {
    let name = Path::new(&words[0]).file_name().unwrap_or_default().to_string_lossy();
    let mut command = Command::new(&words[0]);
    command.args(&words[1..]).current_dir(path);
    match name.as_ref() {
        "xdg-terminal-exec" => { let mut arg = OsString::from("--dir="); arg.push(path); command.arg(arg); }
        "ghostty" => { let mut arg = OsString::from("--working-directory="); arg.push(path); command.arg(arg); }
        "gnome-terminal" | "xfce4-terminal" | "tilix" => { command.arg("--working-directory").arg(path); }
        "konsole" => { command.arg("--workdir").arg(path); }
        "kitty" => { command.arg("--directory").arg(path); }
        "alacritty" => { command.arg("--working-directory").arg(path); }
        "foot" => { command.arg("--working-directory").arg(path); }
        "wezterm" => { command.arg("start").arg("--cwd").arg(path); }
        _ => {} // Other terminals inherit the repository working directory.
    }
    if !child.is_empty() {
        match name.as_ref() {
            "xdg-terminal-exec" | "gnome-terminal" | "kitty" | "foot" | "wezterm" => { command.arg("--"); }
            _ => { command.arg("-e"); }
        }
        command.args(child);
    }
    command
}

fn terminal(path: &Path, child: &[OsString], preference: &str) -> Result<(), String> {
    if preference != "auto" {
        if !["ghostty", "konsole", "gnome-terminal", "kitty", "alacritty", "wezterm", "foot"].contains(&preference) { return Err("Unsupported terminal preference".into()); }
        return start(terminal_command(&[preference.into()], path, child)).map_err(|e| format!("Cannot launch selected terminal {preference}: {e}. Install it or choose System default in Settings."));
    }
    if let Ok(value) = env::var("TERMINAL") {
        if !value.trim().is_empty() {
            return start(terminal_command(&configured(&value)?, path, child))
                .map_err(|e| format!("TERMINAL could not launch: {e}"));
        }
    }
    if start(terminal_command(&["xdg-terminal-exec".into()], path, child)).is_ok() { return Ok(()); }
    // KDE's configured terminal, when xdg-terminal-exec is unavailable.
    if env::var("XDG_CURRENT_DESKTOP").unwrap_or_default().to_uppercase().contains("KDE") {
        for reader in ["kreadconfig6", "kreadconfig5"] {
            if let Ok(output) = Command::new(reader).args(["--file", "kdeglobals", "--group", "General", "--key", "TerminalApplication"]).output() {
                let value = String::from_utf8_lossy(&output.stdout);
                if output.status.success() && !value.trim().is_empty() {
                    return start(terminal_command(&configured(value.trim())?, path, child));
                }
            }
        }
    }
    let mut failures = Vec::new();
    for name in ["x-terminal-emulator", "ghostty", "konsole", "gnome-terminal", "kitty", "alacritty", "wezterm", "foot", "xterm"] {
        match start(terminal_command(&[name.into()], path, child)) {
            Ok(()) => return Ok(()),
            Err(error) => failures.push(format!("{name}: {error}")),
        }
    }
    Err(format!("No terminal could be launched. Set TERMINAL to an installed terminal. {}", failures.join("; ")))
}

fn desktop_file(id: &str) -> Option<PathBuf> {
    if !id.ends_with(".desktop") || id.contains('/') || id.contains('\\') { return None; }
    let mut roots = Vec::new();
    if let Some(home) = env::var_os("XDG_DATA_HOME").filter(|s| !s.is_empty()) {
        roots.push(PathBuf::from(home));
    } else if let Some(home) = env::var_os("HOME") {
        roots.push(PathBuf::from(home).join(".local/share"));
    }
    let dirs = env::var_os("XDG_DATA_DIRS").filter(|s| !s.is_empty())
        .unwrap_or_else(|| OsString::from("/usr/local/share:/usr/share"));
    roots.extend(env::split_paths(&dirs));
    roots.into_iter().map(|p| p.join("applications").join(id)).find(|p| p.is_file())
}

fn editor(path: &Path, preference: &str, terminal_preference: &str) -> Result<(), String> {
    if preference != "auto" {
        if !["kate", "nvim", "code", "codium", "zed"].contains(&preference) { return Err("Unsupported editor preference".into()); }
        if preference == "nvim" { return terminal(path, &["nvim".into(), path.as_os_str().to_owned()], terminal_preference); }
        let mut command = Command::new(preference);
        command.arg(path).current_dir(path);
        return start(command).map_err(|e| format!("Cannot launch selected editor {preference}: {e}. Install it or choose System default in Settings."));
    }
    for key in ["VISUAL", "EDITOR"] {
        if let Ok(value) = env::var(key) {
            if value.trim().is_empty() { continue; }
            let mut words = configured(&value).map_err(|e| format!("Invalid {key}: {e}"))?;
            let name = Path::new(&words[0]).file_name().unwrap_or_default().to_string_lossy().into_owned();
            // File-only terminal editors receive a real file when available.
            let target = if ["nano", "pico", "micro"].contains(&name.as_str()) {
                editor_file(path).ok_or("The selected terminal editor needs a file; this repository has no top-level file")?
            } else { path.to_path_buf() };
            words.push(target.into_os_string());
            if ["vi", "vim", "nvim", "nano", "pico", "micro", "hx", "helix", "emacs", "emacsclient"].contains(&name.as_str()) {
                return terminal(path, &words, terminal_preference);
            }
            let mut command = Command::new(&words[0]);
            command.args(&words[1..]).current_dir(path);
            return start(command).map_err(|e| format!("{key} could not launch: {e}"));
        }
    }
    // Query text/plain, NOT inode/directory, which would select a file manager.
    if let Ok(output) = Command::new("xdg-mime").args(["query", "default", "text/plain"]).output() {
        if output.status.success() {
            if let Some(entry) = desktop_file(String::from_utf8_lossy(&output.stdout).trim()) {
                let mut command = Command::new("gio");
                command.arg("launch").arg(entry).current_dir(path);
                // Generic desktop text editors may not support opening a folder.
                // Open a project file, or launch the editor empty for empty repos.
                if let Some(file) = editor_file(path) { command.arg(file); }
                if start(command).is_ok() { return Ok(()); }
            }
        }
    }
    for name in ["kate", "kwrite", "gedit", "gnome-text-editor", "mousepad", "xed", "code", "codium", "zed"] {
        let mut command = Command::new(name);
        command.current_dir(path);
        if ["kate", "code", "codium", "zed"].contains(&name) { command.arg(path); }
        else if let Some(file) = editor_file(path) { command.arg(file); }
        if start(command).is_ok() { return Ok(()); }
    }
    Err("No editor could be launched. Set your desktop text editor or export VISUAL/EDITOR (for example: kate or nvim).".into())
}

fn editor_file(path: &Path) -> Option<PathBuf> {
    for name in ["README.md", "README", "Cargo.toml", "package.json", ".gitignore"] {
        let file = path.join(name);
        if file.is_file() { return Some(file); }
    }
    None
}

pub fn open(path: &Path, target: &str, editor_preference: &str, terminal_preference: &str) -> Result<(), String> {
    if !cfg!(target_os = "linux") {
        return Err("Automatic application detection currently supports Linux desktops only".into());
    }
    match target {
        "editor" => editor(path, editor_preference, terminal_preference),
        "terminal" => terminal(path, &[], terminal_preference),
        _ => Err("Unsupported application target".into()),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    #[test]
    fn quoted_editor_arguments_are_not_shell_code() {
        let words = configured("kate --new-window '/tmp/a b' '$(touch /tmp/never)'").unwrap();
        assert_eq!(words, vec!["kate", "--new-window", "/tmp/a b", "$(touch /tmp/never)"].into_iter().map(OsString::from).collect::<Vec<_>>());
        assert!(configured("'unterminated").is_err());
    }
    #[test]
    fn xdg_uses_monolithic_directory_and_literal_child_args() {
        let command = terminal_command(&["xdg-terminal-exec".into()], Path::new("/tmp/a b"), &["nvim".into(), "/tmp/a b".into()]);
        assert_eq!(command.get_args().collect::<Vec<_>>(), vec!["--dir=/tmp/a b", "--", "nvim", "/tmp/a b"]);
    }
    #[test]
    fn ghostty_uses_equals_for_directory() {
        let command = terminal_command(&["ghostty".into()], Path::new("/tmp/repo with spaces"), &[]);
        assert_eq!(command.get_args().collect::<Vec<_>>(), vec!["--working-directory=/tmp/repo with spaces"]);
    }
    #[test]
    fn konsole_uses_its_directory_flag() {
        for (terminal, flag) in [("konsole", "--workdir")] {
            let command = terminal_command(&[terminal.into()], Path::new("/tmp/repo"), &[]);
            assert_eq!(command.get_args().collect::<Vec<_>>(), vec![flag, "/tmp/repo"]);
        }
    }
}
