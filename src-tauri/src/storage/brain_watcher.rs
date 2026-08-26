use notify::{RecursiveMode, Watcher};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
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

    /// Find the existing directory for a given conversation_id across candidate brain directories.
    pub fn find_session_dir(conversation_id: &str) -> Option<PathBuf> {
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
        let session_dir = Self::find_session_dir(conversation_id)?;
        let file_path = session_dir.join(file_name);
        if file_path.is_file() {
            fs::read_to_string(file_path).ok()
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

    pub fn start_watching(app: AppHandle) {
        let brain_dirs = Self::get_brain_dirs();
        if brain_dirs.is_empty() {
            return;
        }

        for dir in &brain_dirs {
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

            for event in rx.into_iter().flatten() {
                for path in event.paths {
                    if path.is_file() {
                        let file_name = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        if file_name == "implementation_plan.md"
                            || file_name == "walkthrough.md"
                            || file_name.ends_with(".md")
                        {
                            if let Ok(content) = fs::read_to_string(&path) {
                                let parent_name = path
                                    .parent()
                                    .and_then(|p| p.file_name())
                                    .map(|f| f.to_string_lossy().to_string())
                                    .unwrap_or_default();

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
        });
    }
}
