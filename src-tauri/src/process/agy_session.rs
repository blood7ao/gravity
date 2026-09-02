use crate::process::env_resolver::resolve_system_env;
use crate::process::guard::attach_process_guard;
use crate::process::proxy::ProxyConfig;
use crate::protocol::events::UserEvent;
use std::collections::HashMap;
use std::fs;
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;
use walkdir::WalkDir;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
}

#[derive(serde::Serialize, Clone, Debug, PartialEq, Eq)]
pub struct FileSnapshot {
    pub exists: bool,
    pub content: Option<String>,
    pub can_revert: bool,
}

struct WorkspaceSnapshot {
    root: PathBuf,
    files: HashMap<PathBuf, Option<String>>,
}

pub struct AgySession {
    child: Arc<Mutex<Option<Child>>>,
    stdin: Arc<Mutex<Option<ChildStdin>>>,
    pub current_conversation_id: Arc<Mutex<Option<String>>>,
    pub current_project_dir: Arc<Mutex<Option<String>>>,
    pub current_mode: Arc<Mutex<String>>,
    pub current_effort: Arc<Mutex<String>>,
    pub current_model: Arc<Mutex<Option<String>>>,
    pub current_agent: Arc<Mutex<Option<String>>>,
    file_snapshots: Arc<Mutex<Option<WorkspaceSnapshot>>>,
}

impl Default for AgySession {
    fn default() -> Self {
        Self::new()
    }
}

impl AgySession {
    pub fn new() -> Self {
        Self {
            child: Arc::new(Mutex::new(None)),
            stdin: Arc::new(Mutex::new(None)),
            current_conversation_id: Arc::new(Mutex::new(None)),
            current_project_dir: Arc::new(Mutex::new(None)),
            current_mode: Arc::new(Mutex::new("plan".to_string())),
            current_effort: Arc::new(Mutex::new("high".to_string())),
            current_model: Arc::new(Mutex::new(None)),
            current_agent: Arc::new(Mutex::new(None)),
            file_snapshots: Arc::new(Mutex::new(None)),
        }
    }

    fn is_ignored_component(component: &std::ffi::OsStr) -> bool {
        matches!(
            component.to_string_lossy().as_ref(),
            ".git" | "node_modules" | "target" | "dist" | "build" | "out"
        )
    }

    fn is_ignored_path(root: &Path, path: &Path) -> bool {
        let relative_path = path.strip_prefix(root).unwrap_or(path);
        relative_path.components().any(|c| Self::is_ignored_component(c.as_os_str()))
    }

    fn resolve_snapshot_path(root: &Path, file_path: &str) -> Option<PathBuf> {
        let candidate = PathBuf::from(file_path);
        let candidate = if candidate.is_absolute() {
            candidate
        } else {
            root.join(candidate)
        };

        let resolved = if candidate.exists() {
            candidate.canonicalize().ok()?
        } else {
            let parent = candidate.parent()?.canonicalize().ok()?;
            parent.join(candidate.file_name()?)
        };

        resolved.starts_with(root).then_some(resolved)
    }

    /// Capture the workspace state immediately before a new prompt is sent.
    /// This is the only safe baseline for review/revert because HEAD may already
    /// differ from the user's working tree.
    pub async fn snapshot_workspace(&self) -> Result<(), String> {
        let project_dir = self
            .current_project_dir
            .lock()
            .await
            .clone()
            .ok_or_else(|| "No active project directory".to_string())?;

        let snapshot = tokio::task::spawn_blocking(move || {
            let root = PathBuf::from(project_dir)
                .canonicalize()
                .map_err(|e| format!("Failed to resolve project directory: {e}"))?;

            const MAX_FILE_BYTES: u64 = 8 * 1024 * 1024;
            const MAX_TOTAL_BYTES: u64 = 32 * 1024 * 1024; // 32 MB string bytes budget
            const MAX_FILES: usize = 50_000; // limit overall number of tracked entities

            let mut files = HashMap::new();
            let mut total_bytes = 0u64;

            let walker = WalkDir::new(&root).follow_links(false).into_iter();
            for entry in walker.filter_entry(|e| !Self::is_ignored_component(e.file_name())) {
                if files.len() >= MAX_FILES {
                    break;
                }

                let entry = match entry {
                    Ok(entry) => entry,
                    Err(_) => continue,
                };

                let is_file = entry.file_type().is_file();
                let content = if is_file {
                    entry
                        .metadata()
                        .ok()
                        .filter(|m| m.len() <= MAX_FILE_BYTES)
                        .and_then(|m| {
                            if total_bytes + m.len() <= MAX_TOTAL_BYTES {
                                if let Ok(c) = fs::read_to_string(entry.path()) {
                                    total_bytes += c.len() as u64;
                                    Some(c)
                                } else {
                                    None
                                }
                            } else {
                                None
                            }
                        })
                } else {
                    None
                };

                files.insert(entry.path().to_path_buf(), content);
            }

            Ok::<WorkspaceSnapshot, String>(WorkspaceSnapshot { root, files })
        })
        .await
        .map_err(|e| format!("Snapshot task panicked: {e}"))?
        .map_err(|e| e)?;

        *self.file_snapshots.lock().await = Some(snapshot);
        Ok(())
    }

    pub async fn get_file_snapshot(&self, file_path: &str) -> Option<FileSnapshot> {
        let snapshots = self.file_snapshots.lock().await;
        let snapshot = snapshots.as_ref()?;
        let path = Self::resolve_snapshot_path(&snapshot.root, file_path)?;
        if Self::is_ignored_path(&snapshot.root, &path) {
            return None;
        }

        // Do not return directories as fake nonexistent files.
        if path.is_dir() {
            return None;
        }

        if let Some(content) = snapshot.files.get(&path) {
            return Some(FileSnapshot {
                exists: true,
                content: content.clone(),
                can_revert: content.is_some(),
            });
        }

        Some(FileSnapshot {
            exists: false,
            content: Some(String::new()),
            can_revert: true,
        })
    }

    fn find_agy_binary(envs: &std::collections::HashMap<String, String>) -> String {
        let binary_name = if cfg!(target_os = "windows") {
            "agy.exe"
        } else {
            "agy"
        };

        if let Some(path_var) = envs.get("PATH") {
            for dir in std::env::split_paths(path_var) {
                let candidate = dir.join(binary_name);
                if candidate.is_file() {
                    return candidate.to_string_lossy().to_string();
                }
            }
        }

        if let Some(home) = dirs::home_dir() {
            let local_bin = home.join(".local/bin").join(binary_name);
            if local_bin.is_file() {
                return local_bin.to_string_lossy().to_string();
            }
        }

        binary_name.to_string()
    }

    pub async fn is_running(&self) -> bool {
        let mut child_lock = self.child.lock().await;
        if let Some(ref mut child) = *child_lock {
            matches!(child.try_wait(), Ok(None))
        } else {
            false
        }
    }

    #[allow(clippy::too_many_arguments)]
    pub async fn start(
        &self,
        app: AppHandle,
        project_dir: String,
        attachment_dir: PathBuf,
        mode: String,
        effort: String,
        conversation_id: Option<String>,
        model: Option<String>,
        agent: Option<String>,
        skip_permissions: bool,
        proxy: Option<&ProxyConfig>,
    ) -> Result<String, String> {
        // If there's an existing active child, terminate first
        self.terminate().await;

        let envs = resolve_system_env(proxy);
        let binary_path = Self::find_agy_binary(&envs);


        let mut cmd = Command::new(&binary_path);
        cmd.envs(envs)
            .current_dir(&project_dir)
            .arg("--input-format")
            .arg("stream-json")
            .arg("--output-format")
            .arg("stream-json")
            .arg("--add-dir")
            .arg(&project_dir)
            // Pasted images live outside the project so they do not create untracked files.
            // Adding this directory gives agy explicit, workspace-scoped access to them.
            .arg("--add-dir")
            .arg(&attachment_dir)
            .arg("--mode")
            .arg(&mode);

        if let Some(ref cid) = conversation_id {
            if !cid.trim().is_empty() {
                cmd.args(["--conversation", cid]);
            }
        }

        if let Some(ref m) = model {
            let m_trimmed = m.trim();
            if !m_trimmed.is_empty() {
                let model_to_pass = if m_trimmed == "Gemini 3.7 Flash" {
                    match effort.as_str() {
                        "low" => "Gemini 3.7 Flash (Low)",
                        "medium" => "Gemini 3.7 Flash (Medium)",
                        _ => "Gemini 3.7 Flash (High)",
                    }
                } else {
                    m_trimmed
                };
                cmd.args(["--model", model_to_pass]);
            }
        } else {
            cmd.args(["--effort", &effort]);
        }

        let selected_agent = agent.and_then(|value| {
            let trimmed = value.trim();
            (!trimmed.is_empty()).then(|| trimmed.to_string())
        });
        if let Some(ref selected_agent) = selected_agent {
            cmd.args(["--agent", selected_agent]);
        }

        if skip_permissions {
            cmd.arg("--dangerously-skip-permissions");
        }

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::piped())
            .stderr(Stdio::piped());

        #[cfg(not(target_os = "windows"))]
        unsafe {
            cmd.pre_exec(|| {
                libc::setpgid(0, 0);
                Ok(())
            });
        }

        let mut child_process = cmd
            .spawn()
            .map_err(|e| format!("Failed to start agy ({binary_path}): {e}"))?;

        attach_process_guard(&child_process);

        let stdout = child_process
            .stdout
            .take()
            .ok_or("Failed to capture agy stdout")?;
        let stderr = child_process
            .stderr
            .take()
            .ok_or("Failed to capture agy stderr")?;
        let stdin = child_process
            .stdin
            .take()
            .ok_or("Failed to capture agy stdin")?;

        *self.stdin.lock().await = Some(stdin);
        *self.current_project_dir.lock().await = Some(project_dir.clone());
        *self.current_mode.lock().await = mode.clone();
        *self.current_effort.lock().await = effort.clone();
        *self.current_model.lock().await = model.clone();
        *self.current_agent.lock().await = selected_agent;
        if let Some(cid) = &conversation_id {
            *self.current_conversation_id.lock().await = Some(cid.clone());
        }

        let app_stdout = app.clone();
        let conv_id_clone = self.current_conversation_id.clone();

        // Spawn async reader for stdout NDJSON lines
        tokio::spawn(async move {
            let mut reader = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                        if let Some(event_type) = val.get("event").and_then(|v| v.as_str()) {
                            if event_type == "init" {
                                if let Some(cid) =
                                    val.get("conversation_id").and_then(|v| v.as_str())
                                {
                                    *conv_id_clone.lock().await = Some(cid.to_string());
                                }
                            }
                        }
                    }
                    let _ = app_stdout.emit("agy-event", trimmed.to_string());
                }
            }
            let _ = app_stdout.emit("agy-status", "stopped");
        });

        // Spawn async reader for stderr
        let app_stderr = app.clone();
        tokio::spawn(async move {
            let mut reader = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = reader.next_line().await {
                let trimmed = line.trim();
                if !trimmed.is_empty() {
                    let _ = app_stderr.emit("agy-stderr", trimmed.to_string());
                }
            }
        });

        *self.child.lock().await = Some(child_process);
        let _ = app.emit("agy-status", "running");

        Ok(binary_path)
    }

    pub async fn list_agents(&self, proxy: Option<&ProxyConfig>) -> Result<Vec<String>, String> {
        let envs = resolve_system_env(proxy);
        let binary_path = Self::find_agy_binary(&envs);
        let output = Command::new(&binary_path)
            .envs(envs)
            .arg("agents")
            .stdin(Stdio::null())
            .output()
            .await
            .map_err(|e| format!("Failed to list agents with {binary_path}: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                format!("agy agents exited with status {}", output.status)
            } else {
                stderr
            });
        }

        Ok(String::from_utf8_lossy(&output.stdout)
            .lines()
            .map(str::trim)
            .filter(|name| !name.is_empty())
            .map(str::to_string)
            .collect())
    }

    pub async fn list_models(&self, proxy: Option<&ProxyConfig>) -> Result<Vec<ModelInfo>, String> {
        let envs = resolve_system_env(proxy);
        let binary_path = Self::find_agy_binary(&envs);
        let output = Command::new(&binary_path)
            .envs(envs)
            .arg("models")
            .stdin(Stdio::null())
            .output()
            .await
            .map_err(|e| format!("Failed to list models with {binary_path}: {e}"))?;

        if !output.status.success() {
            let stderr = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if stderr.is_empty() {
                format!("agy models exited with status {}", output.status)
            } else {
                stderr
            });
        }

        let stdout = String::from_utf8_lossy(&output.stdout);
        let mut models = Vec::new();

        for line in stdout.lines() {
            let trimmed = line.trim();
            if trimmed.is_empty() || trimmed.starts_with("Fetching") {
                continue;
            }
            if let Some((id, label)) = trimmed.split_once('\t') {
                models.push(ModelInfo {
                    id: id.trim().to_string(),
                    label: label.trim().to_string(),
                });
            } else {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    let id = parts[0].to_string();
                    let label = parts[1..].join(" ");
                    models.push(ModelInfo { id, label });
                } else if parts.len() == 1 {
                    let name = parts[0].to_string();
                    models.push(ModelInfo {
                        id: name.clone(),
                        label: name,
                    });
                }
            }
        }

        Ok(models)
    }

    pub async fn send_prompt(&self, prompt: &str) -> Result<(), String> {
        // Snapshot failures must not prevent sending a prompt; they only make
        // file review/revert unavailable for that turn.
        let _ = self.snapshot_workspace().await;
        let user_event = UserEvent::new(prompt);
        let json = serde_json::to_string(&user_event).map_err(|e| e.to_string())?;
        self.send_raw_json(&json).await
    }

    pub async fn send_raw_json(&self, json_payload: &str) -> Result<(), String> {
        let mut stdin_lock = self.stdin.lock().await;
        if let Some(ref mut stdin) = *stdin_lock {
            stdin
                .write_all(json_payload.as_bytes())
                .await
                .map_err(|e| format!("Write failed: {e}"))?;
            stdin
                .write_all(b"\n")
                .await
                .map_err(|e| format!("Newline write failed: {e}"))?;
            stdin
                .flush()
                .await
                .map_err(|e| format!("Flush failed: {e}"))?;
            Ok(())
        } else {
            Err("agy process is not active or stdin is unavailable".to_string())
        }
    }

    pub async fn terminate(&self) {
        let mut child_lock = self.child.lock().await;
        if let Some(mut child) = child_lock.take() {
            #[cfg(not(target_os = "windows"))]
            {
                if let Some(id) = child.id() {
                    unsafe {
                        libc::kill(-(id as i32), libc::SIGTERM);
                    }
                }
            }
            let _ = child.kill().await;
        }
        let mut stdin_lock = self.stdin.lock().await;
        *stdin_lock = None;
    }
}
