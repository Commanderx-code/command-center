use crate::{integrations::{Plan, Request}, platform as p};
use serde_json::{json, Value};
use std::path::{Component, Path};

fn git(path: &Path, args: &[&str]) -> Result<String, String> { p::git(path, args) }
fn head(path: &Path) -> String {
    git(path, &["rev-parse", "--verify", "HEAD"]).unwrap_or_default().trim().into()
}
fn branch(path: &Path) -> String {
    git(path, &["symbolic-ref", "--quiet", "HEAD"]).unwrap_or_default().trim().into()
}
pub fn snapshot(path: &Path) -> Result<Value, String> {
    let status = git(path, &["status", "--porcelain=v1", "-z", "--untracked-files=all"])?;
    // The probe API is text-based and bounded. Never offer mutations on an ambiguous list.
    if status.contains('\u{fffd}') || status.len() >= 4_000_000 {
        return Err("File list is too large or contains non-UTF-8 names. Use your terminal for this repository.".into());
    }
    let mut parts = status.split('\0').filter(|s| !s.is_empty());
    let mut files = Vec::new();
    while let Some(entry) = parts.next() {
        let bytes = entry.as_bytes();
        if bytes.len() < 4 || bytes[2] != b' ' || !bytes[..2].is_ascii() { return Err("Invalid Git status response".into()); }
        let code = &entry[..2];
        let original = if code.contains('R') || code.contains('C') { Some(parts.next().ok_or("Incomplete rename status")?) } else { None };
        let conflict = code.contains('U') || code == "AA" || code == "DD";
        files.push(json!({"path": &entry[3..], "original": original, "status": code,
            "staged": !conflict && !matches!(bytes[0], b' ' | b'?'),
            "unstaged": bytes[1] != b' ', "conflict": conflict}));
    }
    let conflicts = files.iter().any(|f| f["conflict"] == true);
    let tree = if conflicts { String::new() } else { git(path, &["write-tree"])?.trim().to_owned() };
    let diff = git(path, &["diff", "--cached", "--no-ext-diff", "--no-textconv", "--no-color", "--patch", "--stat"])?;
    let truncated = diff.len() >= 4_000_000;
    Ok(json!({"files": files, "stagedDiff": diff, "diffTruncated": truncated,
        "indexTree": tree, "head": head(path), "branchRef": branch(path), "conflicts": conflicts}))
}
fn checked_paths(request: &Request, data: &Value) -> Result<Vec<String>, String> {
    if request.files.is_empty() || request.files.len() > 1000 { return Err("Select 1–1000 files".into()); }
    let mut paths = Vec::new();
    for name in &request.files {
        if name.is_empty() || name.contains('\0') || Path::new(name).components().any(|c| !matches!(c, Component::Normal(_) | Component::CurDir)) {
            return Err("Invalid repository-relative filename".into());
        }
        let file = data["files"].as_array().unwrap().iter().find(|f| f["path"].as_str() == Some(name.as_str())).ok_or("File status changed; refresh Details")?;
        if file["conflict"] == true { return Err("Resolve conflicts in your editor or terminal first".into()); }
        if request.action == "unstage" && file["staged"] != true { return Err("Select staged files to unstage".into()); }
        paths.push(name.clone());
        let code = file["status"].as_str().unwrap_or("  ").as_bytes();
        let include_original = (request.action == "unstage" && code[0] == b'R')
            || (request.action == "stage" && code[1] == b'R');
        if include_original {
            if let Some(original) = file["original"].as_str() { paths.push(original.into()); }
        }
    }
    paths.sort(); paths.dedup();
    Ok(paths)
}
pub fn plan(request: &Request) -> Result<Plan, String> {
    let path = p::repo(&request.path)?;
    let data = snapshot(&path)?;
    let mut args: Vec<String> = vec!["-C".into(), path.to_string_lossy().into_owned(), "--literal-pathspecs".into()];
    let explanation = match request.action.as_str() {
        "stage" => {
            let paths = checked_paths(request, &data)?;
            args.extend(["add".into(), "--all".into(), "--".into()]); args.extend(paths);
            "Stage the current contents and deletions of the selected files. This does not commit or push."
        }
        "stage-all" => {
            if data["conflicts"] == true { return Err("Resolve conflicts before staging all files".into()); }
            args.extend(["add", "--all", "--", "."].map(String::from));
            "Stage all current changes, including new files and deletions, throughout this repository. Ignored files remain ignored."
        }
        "unstage" => {
            let paths = checked_paths(request, &data)?;
            if data["head"] == "" { args.extend(["rm", "--cached", "-r", "-f", "--"].map(String::from)); }
            else { args.extend(["reset", "--quiet", "HEAD", "--"].map(String::from)); }
            args.extend(paths);
            "Remove selected changes from staging. Working files remain on disk."
        }
        "commit" => {
            if request.message.trim().is_empty() || request.message.len() > 10000 || request.message.contains('\0') { return Err("Enter a commit message of 1–10000 bytes".into()); }
            if data["conflicts"] == true || !data["files"].as_array().unwrap().iter().any(|f| f["staged"] == true) { return Err("Stage changes and resolve conflicts before committing".into()); }
            if data["diffTruncated"] == true { return Err("Staged diff is too large for review here; commit in your terminal".into()); }
            if data["branchRef"] == "" { return Err("Switch to a branch before committing".into()); }
            if request.index_tree.is_empty() || data["indexTree"] != request.index_tree || data["head"] != request.expected_head || data["branchRef"] != request.branch_ref { return Err("Staged contents or branch changed. Refresh Details and review again.".into()); }
            for marker in ["MERGE_HEAD", "CHERRY_PICK_HEAD", "REVERT_HEAD", "rebase-merge", "rebase-apply", "sequencer"] {
                let marker_path = git(&path, &["rev-parse", "--git-path", marker])?;
                if path.join(marker_path.trim()).exists() { return Err("Finish the active merge, rebase, or cherry-pick in your terminal first".into()); }
            }
            args.extend(["commit".into(), "-m".into(), request.message.clone()]);
            "Commit the staged changes using your Git identity, hooks, and signing configuration. Unstaged changes stay outside the commit. Push is a separate action. If signing or hooks need a terminal prompt, commit in your terminal."
        }
        _ => return Err("Unsupported Git change action".into()),
    };
    let mut plan = Plan::new(&format!("{} · {}", request.action, path.file_name().unwrap_or_default().to_string_lossy()), "git", args, &path);
    plan.explanation = explanation.into();
    Ok(plan)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::{fs, process::Command};
    fn fixture() -> tempfile::TempDir {
        let dir = tempfile::tempdir().unwrap();
        git(dir.path(), &["init", "-b", "main"]).unwrap();
        git(dir.path(), &["config", "user.name", "Fixture"]).unwrap();
        git(dir.path(), &["config", "user.email", "fixture@example.invalid"]).unwrap();
        git(dir.path(), &["config", "commit.gpgsign", "false"]).unwrap();
        dir
    }
    fn request(path: &Path, action: &str, names: &[&str]) -> Request {
        Request { path: path.to_string_lossy().into_owned(), action: action.into(), files: names.iter().map(|v| v.to_string()).collect(), ..Default::default() }
    }
    fn execute(r: &Request) {
        let plan = plan(r).unwrap();
        let output = Command::new(&plan.program).args(&plan.args).current_dir(&plan.cwd).output().unwrap();
        assert!(output.status.success(), "{}", String::from_utf8_lossy(&output.stderr));
    }
    fn commit_request(path: &Path) -> Request {
        let data = snapshot(path).unwrap();
        Request { message: "Fixture commit".into(), index_tree: data["indexTree"].as_str().unwrap().into(), expected_head: data["head"].as_str().unwrap().into(), branch_ref: data["branchRef"].as_str().unwrap().into(), ..request(path, "commit", &[]) }
    }
    #[test]
    fn literal_filenames_initial_commit_and_unstage_preserve_working_files() {
        let dir = fixture(); let path = dir.path();
        for name in ["a[1].txt", "a1.txt", "--flag", "line\nbreak"] { fs::write(path.join(name), "content").unwrap(); }
        execute(&request(path, "stage", &["a[1].txt", "--flag", "line\nbreak"]));
        let staged = git(path, &["diff", "--cached", "--name-only", "-z"]).unwrap();
        assert!(staged.contains("a[1].txt\0")); assert!(!staged.contains("a1.txt\0"));
        execute(&request(path, "unstage", &["--flag"]));
        assert!(path.join("--flag").is_file());
        execute(&commit_request(path));
        assert!(!head(path).is_empty());
        assert!(snapshot(path).unwrap()["files"].as_array().unwrap().iter().any(|f| f["path"] == "a1.txt" && f["staged"] == false));
    }
    #[test]
    fn stale_review_empty_message_and_invalid_paths_are_rejected() {
        let dir = fixture(); let path = dir.path();
        fs::write(path.join("file"), "one").unwrap();
        execute(&request(path, "stage-all", &[]));
        let old = commit_request(path);
        fs::write(path.join("file"), "two").unwrap();
        execute(&request(path, "stage-all", &[]));
        assert!(plan(&old).unwrap_err().contains("changed"));
        let mut current = commit_request(path); current.message.clear();
        assert!(plan(&current).is_err());
        assert!(plan(&request(path, "stage", &["../outside"])).is_err());
        execute(&commit_request(path));
        assert!(plan(&commit_request(path)).is_err());
    }
    #[test]
    fn partially_staged_files_and_renames_round_trip() {
        let dir = fixture(); let path = dir.path();
        fs::write(path.join("before"), "base\n").unwrap();
        execute(&request(path, "stage-all", &[])); execute(&commit_request(path));
        fs::write(path.join("before"), "staged\n").unwrap();
        execute(&request(path, "stage", &["before"]));
        fs::write(path.join("before"), "unstaged\n").unwrap();
        let data = snapshot(path).unwrap(); assert_eq!(data["files"][0]["status"], "MM");
        execute(&commit_request(path));
        assert_eq!(git(path, &["show", "HEAD:before"]).unwrap(), "staged\n");
        execute(&request(path, "stage-all", &[])); execute(&commit_request(path));
        git(path, &["mv", "before", "after"]).unwrap();
        fs::write(path.join("after"), "updated rename\n").unwrap();
        execute(&request(path, "stage", &["after"]));
        // Undo the staged rename through both endpoints while keeping the working destination.
        execute(&request(path, "unstage", &["after"]));
        assert!(path.join("after").is_file());
    }
}
