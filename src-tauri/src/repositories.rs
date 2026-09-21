use serde::Serialize;
use std::{
    collections::HashSet,
    env,
    path::{Path, PathBuf},
};
use walkdir::WalkDir;

#[derive(Debug, Serialize)]
pub struct Repository {
    name: String,
    path: String,
    branch: String,
    dirty: bool,
    modified_files: usize,
    ahead: usize,
    behind: usize,
    remote_url: Option<String>,
    last_commit: Option<String>,
    has_upstream: bool,
    status_error: bool,
}

fn expand_home(path: &str) -> Result<PathBuf, String> {
    if path == "~" || path.starts_with("~/") {
        let home = env::var_os("HOME").ok_or("HOME is not set")?;
        return Ok(PathBuf::from(home).join(if path == "~" { "" } else { &path[2..] }));
    }
    Ok(PathBuf::from(path))
}

fn git(path: &Path, args: &[&str]) -> Option<String> {
    crate::platform::git(path, args)
        .ok()
        .map(|output| output.trim().to_owned())
}

fn inspect(path: &Path) -> Repository {
    let status_result = git(path, &["status", "--porcelain"]);
    let status_error = status_result.is_none();
    let status = status_result.unwrap_or_default();
    let modified_files = status.lines().count();
    let branch = git(path, &["branch", "--show-current"]).unwrap_or_else(|| "detached".into());
    let remote_url = git(path, &["remote", "get-url", "origin"]).filter(|value| !value.is_empty());
    let last_commit = git(path, &["log", "-1", "--format=%s"]).filter(|value| !value.is_empty());
    let has_upstream = git(path, &["rev-parse", "--verify", "@{upstream}"]).is_some();
    let (ahead, behind) = git(
        path,
        &["rev-list", "--left-right", "--count", "HEAD...@{upstream}"],
    )
    .and_then(|value| {
        let mut counts = value
            .split_whitespace()
            .filter_map(|item| item.parse::<usize>().ok());
        Some((counts.next()?, counts.next()?))
    })
    .unwrap_or((0, 0));

    Repository {
        name: path
            .file_name()
            .unwrap_or_default()
            .to_string_lossy()
            .into_owned(),
        path: path.to_string_lossy().into_owned(),
        branch,
        dirty: modified_files > 0,
        modified_files,
        ahead,
        behind,
        remote_url,
        last_commit,
        has_upstream,
        status_error,
    }
}

fn scan(roots: Vec<String>, depth: usize) -> Result<Vec<Repository>, String> {
    if roots.len() > 32 || !(1..=6).contains(&depth) {
        return Err("Invalid scan limits".into());
    }
    let mut found = HashSet::new();
    for root in roots {
        let root = expand_home(&root)?;
        let root = match root.canonicalize() {
            Ok(root) => root,
            Err(_) => continue,
        };
        let entries = WalkDir::new(&root)
            .max_depth(depth)
            .follow_links(false)
            .into_iter()
            .filter_entry(|entry| {
                entry.depth() == 0
                    || ![
                        ".git",
                        "node_modules",
                        "target",
                        ".cache",
                        ".command-center-backups",
                    ]
                    .iter()
                    .any(|name| entry.file_name() == std::ffi::OsStr::new(name))
            });
        for entry in entries.filter_map(Result::ok) {
            if entry.file_type().is_dir() && entry.path().join(".git").exists() {
                if let Ok(path) = entry.path().canonicalize() {
                    found.insert(path);
                }
            }
        }
    }
    let mut repositories: Vec<_> = found.iter().map(|path| inspect(path)).collect();
    repositories.sort_by_key(|repo| repo.name.to_lowercase());
    Ok(repositories)
}

#[tauri::command]
pub async fn discover_repositories(
    roots: Vec<String>,
    scan_depth: Option<usize>,
) -> Result<Vec<Repository>, String> {
    tauri::async_runtime::spawn_blocking(move || scan(roots, scan_depth.unwrap_or(3)))
        .await
        .map_err(|e| e.to_string())?
}

fn remote_web_url(path: &Path) -> Result<String, String> {
    let remote =
        git(path, &["remote", "get-url", "origin"]).ok_or("Repository has no origin remote")?;
    let url = if let Some(value) = remote.strip_prefix("git@github.com:") {
        format!("https://github.com/{}", value.trim_end_matches(".git"))
    } else if let Some(value) = remote.strip_prefix("ssh://git@github.com/") {
        format!("https://github.com/{}", value.trim_end_matches(".git"))
    } else {
        remote.trim_end_matches(".git").to_owned()
    };
    crate::workspace::web_url(&url)?;
    Ok(url)
}

#[tauri::command]
pub async fn open_repository(
    path: String,
    target: String,
    editor: Option<String>,
    terminal: Option<String>,
) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || {
        open_repository_inner(
            path,
            target,
            editor.unwrap_or_else(|| "auto".into()),
            terminal.unwrap_or_else(|| "auto".into()),
        )
    })
    .await
    .map_err(|e| e.to_string())?
}

fn open_repository_inner(
    path: String,
    target: String,
    editor: String,
    terminal: String,
) -> Result<(), String> {
    let path = expand_home(&path)?
        .canonicalize()
        .map_err(|error| error.to_string())?;
    if !path.is_dir() || !path.join(".git").exists() {
        return Err("Path is not a Git repository".into());
    }
    match target.as_str() {
        "editor" => crate::launcher::open(&path, "editor", &editor, &terminal),
        "terminal" => crate::launcher::open(&path, "terminal", &editor, &terminal),
        "remote" => open::that(remote_web_url(&path)?)
            .map_err(|error| format!("Could not open remote: {error}")),
        _ => Err("Unsupported launch target".into()),
    }
}

#[tauri::command]
pub async fn repository_details(path: String) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let path = crate::platform::repo(&path)?;
        let status = crate::platform::git(&path, &["status", "--porcelain=v1", "-z"])?;
        let mut entries = status.split('\0').filter(|s| !s.is_empty());
        let mut files = Vec::new();
        while let Some(entry) = entries.next() {
            if entry.len() < 3 { continue; }
            let code = &entry[..2]; let file = &entry[3..];
            let original = if code.contains('R') || code.contains('C') { entries.next() } else { None };
            files.push(serde_json::json!({"status":code,"path":file,"original":original}));
        }
        let log = crate::platform::git(&path, &["log", "-15", "--format=%h%x1f%s%x1f%ar"]).unwrap_or_default();
        let commits: Vec<_> = log.lines().filter_map(|line| { let v: Vec<_> = line.splitn(3,'\x1f').collect(); if v.len()==3 { Some(serde_json::json!({"hash":v[0],"subject":v[1],"age":v[2]})) } else { None } }).collect();
        let diff = crate::platform::git(&path, &["diff", "--no-ext-diff", "--no-textconv", "--stat", "HEAD"]).unwrap_or_default();
        Ok(serde_json::json!({"files":files,"commits":commits,"diff":diff,"repository":inspect(&path)}))
    }).await.map_err(|e| e.to_string())?
}
