use notify::{EventKind, RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::collections::HashSet;
use std::fs;
use std::path::{Path, PathBuf};
use std::sync::mpsc::channel;
use std::thread;
use tauri::{AppHandle, Emitter};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ArtifactInfo {
    pub name: String,
    pub path: String,
    pub content: String,
    pub updated_at: i64,
}

pub struct BrainWatcher;

impl BrainWatcher {
    /// Return all candidate directories where brain data may reside.
    pub fn get_brain_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Ok(custom_dir) = std::env::var("ANTIGRAVITY_APP_DATA_DIR") {
            dirs.push(PathBuf::from(custom_dir).join("brain"));
        }
        if let Ok(custom_dir) = std::env::var("AGY_APP_DATA_DIR") {
            dirs.push(PathBuf::from(custom_dir).join("brain"));
        }

        if let Some(h) = dirs::home_dir() {
            dirs.push(h.join(".gemini/antigravity-cli/brain"));
            dirs.push(h.join(".gemini/antigravity/brain"));
            dirs.push(h.join(".gemini/antigravity-ide/brain"));
        }

        dirs
    }

    /// Return all candidate directories where presence locks reside.
    pub fn get_presence_dirs() -> Vec<PathBuf> {
        let mut dirs = Vec::new();

        if let Ok(custom_dir) = std::env::var("ANTIGRAVITY_APP_DATA_DIR") {
            dirs.push(PathBuf::from(custom_dir).join("presence"));
        }
        if let Ok(custom_dir) = std::env::var("AGY_APP_DATA_DIR") {
            dirs.push(PathBuf::from(custom_dir).join("presence"));
        }

        if let Some(h) = dirs::home_dir() {
            dirs.push(h.join(".gemini/antigravity-cli/presence"));
            dirs.push(h.join(".gemini/antigravity/presence"));
            dirs.push(h.join(".gemini/antigravity-ide/presence"));
        }

        dirs
    }

    /// Check if a process currently holds an advisory file lock on the target lock file.
    #[cfg(unix)]
    pub fn is_lock_held(path: &Path) -> bool {
        use std::os::unix::io::AsRawFd;
        if let Ok(file) = fs::File::open(path) {
            let fd = file.as_raw_fd();
            let ret = unsafe { libc::flock(fd, libc::LOCK_SH | libc::LOCK_NB) };
            if ret != 0 {
                // Lock is actively held by a running CLI / IDE process!
                return true;
            }
            unsafe { libc::flock(fd, libc::LOCK_UN) };
        }
        false
    }

    #[cfg(not(unix))]
    pub fn is_lock_held(path: &Path) -> bool {
        if let Ok(_) = fs::OpenOptions::new().write(true).open(path) {
            false
        } else {
            true
        }
    }

    /// Determine if a given conversation is actively running in CLI or background.
    pub fn is_session_active(conversation_id: &str) -> bool {
        if conversation_id.contains('/') || conversation_id.contains('\\') || conversation_id.contains("..") {
            return false;
        }
        for pdir in Self::get_presence_dirs() {
            let lock_path = pdir.join(format!("{conversation_id}.lock"));
            if lock_path.is_file() && Self::is_lock_held(&lock_path) {
                return true;
            }
        }
        false
    }

    /// List all currently active conversation IDs across presence locks.
    pub fn list_active_sessions() -> Vec<String> {
        let mut active = Vec::new();
        for pdir in Self::get_presence_dirs() {
            if let Ok(entries) = fs::read_dir(pdir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_file() {
                        if let Some(file_name) = path.file_name().and_then(|f| f.to_str()) {
                            if let Some(cid) = file_name.strip_suffix(".lock") {
                                if !cid.is_empty() && Self::is_lock_held(&path) {
                                    if !active.contains(&cid.to_string()) {
                                        active.push(cid.to_string());
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
        active
    }

    /// Determine comprehensive session status: "running" | "plan_ready" | "incomplete" | "completed"
    pub fn get_session_status(conversation_id: &str) -> String {
        if Self::is_session_active(conversation_id) {
            return "running".to_string();
        }

        if let Some(session_dir) = Self::find_session_dir(conversation_id) {
            let plan_path = session_dir.join("implementation_plan.md");

            if let Some(tpath) = Self::find_transcript_path(conversation_id) {
                let steps = Self::read_transcript_steps(&tpath);
                if let Some(last_step) = steps.last() {
                    let step_type = last_step.get("type").and_then(|v| v.as_str());
                    let status = last_step.get("status").and_then(|v| v.as_str());
                    if step_type == Some("USER_INPUT") {
                        return "incomplete".to_string();
                    }
                    if status == Some("ERROR") {
                        return "incomplete".to_string();
                    }
                    if let Some(content) = last_step.get("content").and_then(|v| v.as_str()) {
                        let lower = content.to_lowercase();
                        if lower.contains("timed out") || lower.contains("timeout") || lower.contains("error:") {
                            return "incomplete".to_string();
                        }
                    }
                    if step_type == Some("PLANNER_RESPONSE") {
                        let has_tool_calls = last_step
                            .get("tool_calls")
                            .and_then(|v| v.as_array())
                            .map(|a| !a.is_empty())
                            .unwrap_or(false);
                        let content_empty = last_step
                            .get("content")
                            .and_then(|v| v.as_str())
                            .unwrap_or("")
                            .trim()
                            .is_empty();
                        if has_tool_calls && content_empty {
                            return "incomplete".to_string();
                        }
                        if plan_path.is_file() {
                            return "plan_ready".to_string();
                        }
                    }
                }
            } else if plan_path.is_file() {
                // Keep supporting sessions whose plan was written before a transcript
                // was created, but do not let a stale plan override later transcript steps.
                return "plan_ready".to_string();
            }
        }

        "completed".to_string()
    }

    /// Find the existing directory for a given conversation_id across candidate brain directories.
    pub fn find_session_dir(conversation_id: &str) -> Option<PathBuf> {
        if conversation_id.contains('/') || conversation_id.contains('\\') || conversation_id.contains("..") {
            return None;
        }
        for brain_dir in Self::get_brain_dirs() {
            let session_dir = brain_dir.join(conversation_id);
            if session_dir.is_dir() {
                return Some(session_dir);
            }
        }
        None
    }

    /// Find the transcript file path for a session (prefer untruncated transcript_full.jsonl).
    pub fn find_transcript_path(conversation_id: &str) -> Option<PathBuf> {
        let session_dir = Self::find_session_dir(conversation_id)?;
        let t_full = session_dir.join(".system_generated/logs/transcript_full.jsonl");
        if t_full.is_file() {
            return Some(t_full);
        }
        let t1 = session_dir.join(".system_generated/logs/transcript.jsonl");
        if t1.is_file() {
            return Some(t1);
        }
        None
    }

    pub fn read_artifact(conversation_id: &str, file_name: &str) -> Option<String> {
        if file_name.contains('/') || file_name.contains('\\') || file_name.contains("..") {
            return None;
        }
        let session_dir = Self::find_session_dir(conversation_id)?;
        let file_path = session_dir.join(file_name);
        if file_path.is_file() {
            // Defense-in-depth against symlink escapes: resolve the target and make
            // sure it still lives inside the session directory before reading it.
            let session_canonical = fs::canonicalize(&session_dir).ok()?;
            let canonical = fs::canonicalize(&file_path).ok()?;
            if !canonical.starts_with(&session_canonical) {
                return None;
            }
            fs::read_to_string(canonical).ok()
        } else {
            None
        }
    }

    pub fn list_artifacts_for_session(conversation_id: &str) -> Vec<ArtifactInfo> {
        let mut list = Vec::new();
        let Some(session_dir) = Self::find_session_dir(conversation_id) else {
            return list;
        };

        if let Ok(entries) = fs::read_dir(session_dir) {
            for entry in entries.flatten() {
                let path = entry.path();
                if path.is_file() {
                    let file_name = path
                        .file_name()
                        .unwrap_or_default()
                        .to_string_lossy()
                        .to_string();
                    if file_name.ends_with(".md")
                        || file_name.ends_with(".txt")
                        || file_name.ends_with(".json")
                    {
                        if let Ok(content) = fs::read_to_string(&path) {
                            let metadata = entry.metadata().ok();
                            let updated_at = metadata
                                .and_then(|m| m.modified().ok())
                                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                .map(|d| d.as_millis() as i64)
                                .unwrap_or(0);

                            list.push(ArtifactInfo {
                                name: file_name,
                                path: path.to_string_lossy().to_string(),
                                content,
                                updated_at,
                            });
                        }
                    }
                }
            }
        }

        list
    }

    /// Read lines as JSON values from transcript file.
    pub fn read_transcript_steps(path: &Path) -> Vec<serde_json::Value> {
        let mut steps = Vec::new();
        if let Ok(content) = fs::read_to_string(path) {
            for line in content.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        steps.push(val);
                    }
                }
            }
        }
        steps
    }

    /// Extract conversation ID from a brain or presence file path.
    pub fn extract_conversation_id(path: &Path) -> Option<String> {
        for bdir in Self::get_brain_dirs() {
            if let Ok(rel) = path.strip_prefix(&bdir) {
                if let Some(comp) = rel.components().next() {
                    let cid = comp.as_os_str().to_string_lossy().to_string();
                    if !cid.is_empty() && !cid.starts_with('.') {
                        return Some(cid);
                    }
                }
            }
        }

        for pdir in Self::get_presence_dirs() {
            if let Ok(rel) = path.strip_prefix(&pdir) {
                if let Some(file_name) = rel.to_str() {
                    if let Some(cid) = file_name.strip_suffix(".lock") {
                        if !cid.is_empty() {
                            return Some(cid.to_string());
                        }
                    }
                }
            }
        }

        None
    }

    pub fn start_watching(app: AppHandle) {
        let brain_dirs = Self::get_brain_dirs();
        let presence_dirs = Self::get_presence_dirs();

        for dir in &brain_dirs {
            let _ = fs::create_dir_all(dir);
        }
        for dir in &presence_dirs {
            let _ = fs::create_dir_all(dir);
        }

        thread::spawn(move || {
            let (tx, rx) = channel();
            let mut watcher = match notify::recommended_watcher(tx) {
                Ok(w) => w,
                Err(e) => {
                    eprintln!("Failed to initialize brain watcher: {e}");
                    return;
                }
            };

            for dir in &brain_dirs {
                if let Err(e) = watcher.watch(dir, RecursiveMode::Recursive) {
                    eprintln!("Failed to watch brain dir {}: {e}", dir.display());
                }
            }
            for dir in &presence_dirs {
                if let Err(e) = watcher.watch(dir, RecursiveMode::NonRecursive) {
                    eprintln!("Failed to watch presence dir {}: {e}", dir.display());
                }
            }

            // Coalesce bursts: a streaming CLI can emit many transcript events
            // back-to-back, and re-reading the whole transcript per event is O(N).
            // Drain everything already queued and process each path at most once,
            // so a burst costs a single batched pass instead of one re-read per event.
            loop {
                let first = match rx.recv() {
                    Ok(ev) => ev,
                    Err(_) => break, // all senders dropped: watcher is shutting down
                };
                let mut pending = Vec::with_capacity(4);
                pending.push(first);
                pending.extend(rx.try_iter());

                let mut seen: HashSet<PathBuf> = HashSet::with_capacity(pending.len());
                for event in pending.into_iter().flatten() {
                    let is_removed = matches!(event.kind, EventKind::Remove(_));
                    for path in event.paths {
                        if !seen.insert(path.clone()) {
                            continue;
                        }
                        let file_name = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();

                        // Removal events point to a path that no longer exists, so process
                        // presence separately from regular file reads.
                        if file_name.ends_with(".lock") {
                            if let Some(cid) = Self::extract_conversation_id(&path) {
                                let is_active = Self::is_session_active(&cid);
                                let _ = app.emit(
                                    "session-presence-update",
                                    serde_json::json!({
                                        "conversation_id": cid,
                                        "is_active": is_active,
                                    }),
                                );
                            }
                        }

                        if !is_removed && path.is_file() {

                            // 1. Transcript live updates from external CLI / IDE
                            if file_name == "transcript.jsonl" || file_name == "transcript_full.jsonl" {
                                if let Some(cid) = Self::extract_conversation_id(&path) {
                                    let steps = Self::read_transcript_steps(&path);
                                    let is_active = Self::is_session_active(&cid);
                                    let _ = app.emit(
                                        "brain-transcript-update",
                                        serde_json::json!({
                                            "conversation_id": cid,
                                            "steps": steps,
                                            "is_active": is_active,
                                        }),
                                    );
                                }
                            }

                            // 2. Artifact updates (Implementation plans, Walkthroughs, etc.)
                            if file_name == "implementation_plan.md"
                                || file_name == "walkthrough.md"
                                || file_name.ends_with(".md")
                            {
                                if let Ok(content) = fs::read_to_string(&path) {
                                    let parent_name = Self::extract_conversation_id(&path).unwrap_or_default();

                                    let info = ArtifactInfo {
                                        name: file_name,
                                        path: path.to_string_lossy().to_string(),
                                        content,
                                        updated_at: chrono::Utc::now().timestamp_millis(),
                                    };

                                    let _ = app.emit(
                                        "brain-artifact-update",
                                        serde_json::json!({
                                            "conversation_id": parent_name,
                                            "artifact": info,
                                        }),
                                    );
                                }
                            }
                        }
                    }
                }
            }
        });
    }
}
