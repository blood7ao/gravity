use crate::process::env_resolver::resolve_system_env;
use crate::process::guard::attach_process_guard;
use crate::protocol::events::UserEvent;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::process::{Child, ChildStdin, Command};
use tokio::sync::Mutex;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct ModelInfo {
    pub id: String,
    pub label: String,
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
        }
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
    ) -> Result<String, String> {
        // If there's an existing active child, terminate first
        self.terminate().await;

        let envs = resolve_system_env();
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

    pub async fn list_agents(&self) -> Result<Vec<String>, String> {
        let envs = resolve_system_env();
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

    pub async fn list_models(&self) -> Result<Vec<ModelInfo>, String> {
        let envs = resolve_system_env();
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
