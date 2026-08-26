use base64::{engine::general_purpose::STANDARD, Engine as _};
use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;
use std::sync::Arc;
use tauri::AppHandle;
use tauri::State;
use walkdir::WalkDir;

pub mod auth;
pub mod process;
pub mod protocol;
pub mod storage;

use auth::oauth::OAuthFlowState;
use process::agy_session::{AgySession, ModelInfo};
use storage::accounts;
use storage::brain_watcher::{ArtifactInfo, BrainWatcher};
use storage::db::{Database, ProjectRecord, SessionRecord};

pub struct AppState {
    pub session: Arc<AgySession>,
    pub db: Arc<Database>,
    pub account_switch_lock: tokio::sync::Mutex<()>,
    pub oauth_state: Arc<OAuthFlowState>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct SessionInfo {
    pub is_running: bool,
    pub conversation_id: Option<String>,
    pub project_dir: Option<String>,
    pub mode: String,
    pub effort: String,
    pub model: Option<String>,
    pub agent: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct FileInfo {
    pub relative_path: String,
    pub absolute_path: String,
    pub is_dir: bool,
    pub size: u64,
}

#[derive(serde::Serialize, serde::Deserialize)]
pub struct FileDiffPayload {
    pub file_path: String,
    pub original_content: String,
    pub modified_content: String,
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PastedImageInfo {
    pub file_path: String,
    pub file_name: String,
}

fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .map(|d| d.join("antigravity-codex"))
        .unwrap_or_else(|| PathBuf::from("./data"))
}

fn pasted_images_dir() -> PathBuf {
    app_data_dir().join("pasted-images")
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn start_session(
    app: AppHandle,
    state: State<'_, AppState>,
    project_dir: String,
    mode: String,
    effort: String,
    conversation_id: Option<String>,
    model: Option<String>,
    agent: Option<String>,
    skip_permissions: Option<bool>,
) -> Result<String, String> {
    let skip = skip_permissions.unwrap_or(false);
    let attachment_dir = pasted_images_dir();
    fs::create_dir_all(&attachment_dir)
        .map_err(|e| format!("Failed to prepare pasted-image storage: {e}"))?;
    state
        .session
        .start(
            app,
            project_dir,
            attachment_dir,
            mode,
            effort,
            conversation_id,
            model,
            agent,
            skip,
        )
        .await
}

#[tauri::command]
fn save_pasted_image(data_url: String, mime_type: String) -> Result<PastedImageInfo, String> {
    const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;

    let extension = match mime_type.as_str() {
        "image/png" => "png",
        "image/jpeg" => "jpg",
        "image/webp" => "webp",
        "image/gif" => "gif",
        _ => return Err("Only PNG, JPEG, WebP, and GIF images can be pasted".to_string()),
    };

    let encoded = data_url
        .split_once(',')
        .map(|(_, value)| value)
        .unwrap_or(data_url.as_str());
    let image_bytes = STANDARD
        .decode(encoded)
        .map_err(|e| format!("Invalid pasted-image data: {e}"))?;

    if image_bytes.is_empty() {
        return Err("The pasted image is empty".to_string());
    }
    if image_bytes.len() > MAX_IMAGE_BYTES {
        return Err("The pasted image exceeds the 10 MB limit".to_string());
    }

    let directory = pasted_images_dir();
    fs::create_dir_all(&directory)
        .map_err(|e| format!("Failed to create pasted-image storage: {e}"))?;

    let file_name = format!(
        "pasted-{}-{}.{}",
        chrono::Utc::now().format("%Y%m%d-%H%M%S"),
        uuid::Uuid::new_v4(),
        extension
    );
    let file_path = directory.join(&file_name);
    fs::write(&file_path, image_bytes).map_err(|e| format!("Failed to save pasted image: {e}"))?;

    Ok(PastedImageInfo {
        file_path: file_path.to_string_lossy().to_string(),
        file_name,
    })
}

#[tauri::command]
async fn send_prompt(state: State<'_, AppState>, content: String) -> Result<(), String> {
    state.session.send_prompt(&content).await
}

#[tauri::command]
async fn send_raw_json(state: State<'_, AppState>, payload: String) -> Result<(), String> {
    state.session.send_raw_json(&payload).await
}

#[tauri::command]
async fn stop_session(state: State<'_, AppState>) -> Result<(), String> {
    state.session.terminate().await;
    Ok(())
}

#[tauri::command]
async fn is_session_running(state: State<'_, AppState>) -> Result<bool, String> {
    Ok(state.session.is_running().await)
}

#[tauri::command]
async fn get_current_session_info(state: State<'_, AppState>) -> Result<SessionInfo, String> {
    let running = state.session.is_running().await;
    let cid = state.session.current_conversation_id.lock().await.clone();
    let dir = state.session.current_project_dir.lock().await.clone();
    let mode = state.session.current_mode.lock().await.clone();
    let effort = state.session.current_effort.lock().await.clone();
    let model = state.session.current_model.lock().await.clone();
    let agent = state.session.current_agent.lock().await.clone();

    Ok(SessionInfo {
        is_running: running,
        conversation_id: cid,
        project_dir: dir,
        mode,
        effort,
        model,
        agent,
    })
}

#[tauri::command]
async fn list_models(state: State<'_, AppState>) -> Result<Vec<ModelInfo>, String> {
    state.session.list_models().await
}

#[tauri::command]
async fn list_agents(state: State<'_, AppState>) -> Result<Vec<String>, String> {
    state.session.list_agents().await
}

#[tauri::command]
fn list_accounts(state: State<'_, AppState>) -> Result<Vec<storage::db::AccountRecord>, String> {
    accounts::list_accounts(&state.db)
}

#[tauri::command]
async fn import_active_account(
    state: State<'_, AppState>,
) -> Result<storage::db::AccountRecord, String> {
    let _switch_guard = state.account_switch_lock.lock().await;

    // The official app may have just changed the Keychain credential. agy reads that
    // credential only at startup, so end this local process before the saved account
    // is used by the next conversation.
    state.session.terminate().await;
    let acc = accounts::import_active_account(&state.db)?;
    restart_standalone_language_server();
    Ok(acc)
}

#[tauri::command]
async fn start_google_oauth(
    state: State<'_, AppState>,
) -> Result<storage::db::AccountRecord, String> {
    let _switch_guard = state.account_switch_lock.lock().await;
    state.session.terminate().await;

    let result = auth::oauth::run_oauth_flow(state.oauth_state.clone()).await?;

    let acc = accounts::save_and_activate_oauth_account(
        &state.db,
        &result.email,
        &result.name,
        &result.access_token,
        &result.refresh_token,
        &result.expiry_iso,
    )?;
    restart_standalone_language_server();
    Ok(acc)
}

#[tauri::command]
async fn cancel_google_oauth(state: State<'_, AppState>) -> Result<(), String> {
    let mut cancel_tx = state.oauth_state.cancel_tx.lock().await;
    if let Some(tx) = cancel_tx.take() {
        let _ = tx.send(());
    }
    Ok(())
}

#[tauri::command]
async fn submit_manual_auth_code(
    state: State<'_, AppState>,
    code_or_url: String,
) -> Result<storage::db::AccountRecord, String> {
    let _switch_guard = state.account_switch_lock.lock().await;
    state.session.terminate().await;

    let verifier = {
        let lock = state.oauth_state.active_verifier.lock().await;
        lock.clone()
    };

    let result = auth::oauth::exchange_manual_code(&code_or_url, verifier.as_deref()).await?;

    let acc = accounts::save_and_activate_oauth_account(
        &state.db,
        &result.email,
        &result.name,
        &result.access_token,
        &result.refresh_token,
        &result.expiry_iso,
    )?;
    restart_standalone_language_server();
    Ok(acc)
}

#[tauri::command]
async fn refresh_account_token(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<storage::db::AccountRecord, String> {
    let _switch_guard = state.account_switch_lock.lock().await;
    let acc = accounts::refresh_account(&state.db, &account_id).await?;
    restart_standalone_language_server();
    Ok(acc)
}

/// Hand sign-in to the installed official app instead of collecting Google credentials
/// or OAuth tokens in this client.
#[tauri::command]
fn open_official_antigravity_login() -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        Command::new("/usr/bin/open")
            .args(["-b", "com.google.antigravity"])
            .spawn()
            .map_err(|error| {
                format!(
                    "Could not open Antigravity. Install the official Antigravity app, then sign in there: {error}"
                )
            })?;
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    Err("Official Antigravity login handoff is currently available on macOS only".to_string())
}

#[cfg(target_os = "macos")]
fn restart_standalone_language_server() {
    if let Ok(ps_output) = std::process::Command::new("ps").arg("aux").output() {
        let ps_str = String::from_utf8_lossy(&ps_output.stdout);
        for line in ps_str.lines() {
            if line.contains("language_server")
                && line.contains("--standalone")
                && !line.contains("--enable_lsp")
            {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let _ = std::process::Command::new("kill")
                        .args(["-9", parts[1]])
                        .output();
                }
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
fn restart_standalone_language_server() {}

#[tauri::command]
async fn switch_active_account(
    state: State<'_, AppState>,
    account_id: String,
) -> Result<storage::db::AccountRecord, String> {
    let _switch_guard = state.account_switch_lock.lock().await;

    // agy caches the credential at process start. Ending this local subprocess is required
    // before the next turn can use the newly activated Keychain item.
    state.session.terminate().await;
    let result = accounts::switch_account(&state.db, &account_id).await;
    restart_standalone_language_server();
    result
}

#[tauri::command]
fn remove_account(state: State<'_, AppState>, account_id: String) -> Result<(), String> {
    accounts::remove_account(&state.db, &account_id)
}

#[tauri::command]
fn list_projects(state: State<'_, AppState>) -> Result<Vec<ProjectRecord>, String> {
    state.db.list_projects().map_err(|e| e.to_string())
}

#[tauri::command]
fn add_project(
    state: State<'_, AppState>,
    path: String,
    name: String,
) -> Result<ProjectRecord, String> {
    state
        .db
        .upsert_project(&name, &path)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn remove_project(state: State<'_, AppState>, id: String) -> Result<(), String> {
    state.db.remove_project(&id).map_err(|e| e.to_string())
}

#[tauri::command]
fn list_sessions(
    state: State<'_, AppState>,
    project_path: Option<String>,
) -> Result<Vec<SessionRecord>, String> {
    state
        .db
        .list_sessions(project_path.as_deref())
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn save_session(state: State<'_, AppState>, record: SessionRecord) -> Result<(), String> {
    state.db.save_session(&record).map_err(|e| e.to_string())
}

#[tauri::command]
fn get_setting(state: State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    state.db.get_setting(&key).map_err(|e| e.to_string())
}

#[tauri::command]
fn set_setting(state: State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    state
        .db
        .set_setting(&key, &value)
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn read_file_content(file_path: String) -> Result<String, String> {
    fs::read_to_string(&file_path).map_err(|e| format!("Failed to read {file_path}: {e}"))
}

#[tauri::command]
fn write_file_content(file_path: String, content: String) -> Result<(), String> {
    let p = Path::new(&file_path);
    if let Some(parent) = p.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(&file_path, content).map_err(|e| format!("Failed to write {file_path}: {e}"))
}

#[tauri::command]
fn get_workspace_files(
    project_dir: String,
    query: Option<String>,
    max_results: Option<usize>,
) -> Result<Vec<FileInfo>, String> {
    let root = PathBuf::from(&project_dir);
    if !root.is_dir() {
        return Ok(Vec::new());
    }

    let q = query.map(|s| s.to_lowercase());
    let max = max_results.unwrap_or(200);
    let mut results = Vec::new();

    let walker = WalkDir::new(&root).max_depth(8).into_iter();
    for entry in walker.filter_entry(|e| {
        let name = e.file_name().to_string_lossy();
        !name.starts_with(".git")
            && name != "node_modules"
            && name != "target"
            && name != "dist"
            && name != "build"
            && name != ".venv"
    }).flatten() {
        let path = entry.path();
        if let Ok(rel) = path.strip_prefix(&root) {
            let rel_str = rel.to_string_lossy().to_string();
            if rel_str.is_empty() {
                continue;
            }

            if let Some(ref search) = q {
                if !rel_str.to_lowercase().contains(search) {
                    continue;
                }
            }

            let is_dir = entry.file_type().is_dir();
            let size = entry.metadata().map(|m| m.len()).unwrap_or(0);

            results.push(FileInfo {
                relative_path: rel_str,
                absolute_path: path.to_string_lossy().to_string(),
                is_dir,
                size,
            });

            if results.len() >= max {
                break;
            }
        }
    }

    Ok(results)
}

#[tauri::command]
fn get_brain_artifacts(conversation_id: String) -> Result<Vec<ArtifactInfo>, String> {
    Ok(BrainWatcher::list_artifacts_for_session(&conversation_id))
}

#[tauri::command]
fn read_brain_artifact(conversation_id: String, name: String) -> Result<Option<String>, String> {
    Ok(BrainWatcher::read_artifact(&conversation_id, &name))
}

#[tauri::command]
fn get_conversation_transcript(conversation_id: String) -> Result<Vec<serde_json::Value>, String> {
    let Some(transcript_path) = BrainWatcher::find_transcript_path(&conversation_id) else {
        return Ok(Vec::new());
    };

    let content = fs::read_to_string(transcript_path).map_err(|e| e.to_string())?;
    let mut steps = Vec::new();
    for line in content.lines() {
        let trimmed = line.trim();
        if !trimmed.is_empty() {
            if let Ok(val) = serde_json::from_str::<serde_json::Value>(trimmed) {
                steps.push(val);
            }
        }
    }

    Ok(steps)
}

#[tauri::command]
fn get_raw_transcript_text(conversation_id: String) -> Result<String, String> {
    let Some(transcript_path) = BrainWatcher::find_transcript_path(&conversation_id) else {
        return Ok(String::new());
    };

    fs::read_to_string(transcript_path).map_err(|e| e.to_string())
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserQuotaBucket {
    pub bucket_id: String,
    pub display_name: String,
    pub description: Option<String>,
    pub window: String,
    pub remaining_fraction: f64,
    pub remaining_percent: u32,
    pub reset_time: Option<String>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserQuotaGroup {
    pub display_name: String,
    pub description: Option<String>,
    pub buckets: Vec<UserQuotaBucket>,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct UserQuotaInfo {
    pub account_email: Option<String>,
    pub tier_name: String,
    pub groups: Vec<UserQuotaGroup>,
    pub gemini_weekly_percent: Option<u32>,
    pub gemini_weekly_desc: Option<String>,
    pub gemini_5h_percent: Option<u32>,
    pub gemini_5h_desc: Option<String>,
    pub claude_weekly_percent: Option<u32>,
    pub claude_5h_percent: Option<u32>,
    pub is_authenticated: bool,
}

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct AccountWithQuotaInfo {
    pub id: String,
    pub email: String,
    pub label: String,
    pub is_active: bool,
    pub tier_name: String,
    pub gemini_5h_percent: Option<u32>,
    pub gemini_5h_desc: Option<String>,
    pub gemini_5h_reset: Option<String>,
    pub gemini_weekly_percent: Option<u32>,
    pub gemini_weekly_desc: Option<String>,
    pub gemini_weekly_reset: Option<String>,
    pub claude_5h_percent: Option<u32>,
    pub claude_weekly_percent: Option<u32>,
    pub claude_weekly_reset: Option<String>,
    pub last_used_at: i64,
    pub is_valid: bool,
}

#[derive(Debug, Clone, Default)]
pub struct CloudQuotaResult {
    pub tier_name: String,
    pub gemini_weekly_percent: Option<u32>,
    pub gemini_weekly_desc: Option<String>,
    pub gemini_weekly_reset: Option<String>,
    pub gemini_5h_percent: Option<u32>,
    pub gemini_5h_desc: Option<String>,
    pub gemini_5h_reset: Option<String>,
    pub claude_weekly_percent: Option<u32>,
    pub claude_weekly_reset: Option<String>,
    pub claude_5h_percent: Option<u32>,
    pub is_valid: bool,
}

pub async fn query_cloud_account_quota(access_token: &str) -> CloudQuotaResult {
    let client = match reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(8))
        .build()
    {
        Ok(c) => c,
        Err(_) => return CloudQuotaResult::default(),
    };

    // 1. loadCodeAssist
    let load_resp = match client
        .post("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist")
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .header("User-Agent", "antigravity/2.10.0")
        .body("{}")
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return CloudQuotaResult {
                tier_name: "Standard".to_string(),
                is_valid: true,
                ..Default::default()
            };
        }
    };

    if !load_resp.status().is_success() {
        return CloudQuotaResult {
            tier_name: "Standard".to_string(),
            is_valid: false,
            ..Default::default()
        };
    }

    let load_json: serde_json::Value = match load_resp.json().await {
        Ok(j) => j,
        Err(_) => {
            return CloudQuotaResult {
                tier_name: "Standard".to_string(),
                is_valid: false,
                ..Default::default()
            };
        }
    };

    let mut tier_name = "Gemini Code Assist Standard".to_string();
    if let Some(t) = load_json
        .get("currentTier")
        .and_then(|t| t.get("name"))
        .and_then(|n| n.as_str())
    {
        tier_name = t.to_string();
    } else if let Some(tiers) = load_json.get("allowedTiers").and_then(|t| t.as_array()) {
        if let Some(first) = tiers.first() {
            if let Some(name) = first.get("name").and_then(|n| n.as_str()) {
                tier_name = name.to_string();
            }
        }
    }

    let project = load_json
        .get("cloudaicompanionProject")
        .and_then(|p| p.as_str())
        .unwrap_or("")
        .to_string();

    if project.is_empty() {
        return CloudQuotaResult {
            tier_name,
            is_valid: true,
            ..Default::default()
        };
    }

    // 2. retrieveUserQuotaSummary
    let quota_body = serde_json::json!({ "project": project });
    let quota_resp = match client
        .post("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary")
        .header("Authorization", format!("Bearer {access_token}"))
        .header("Content-Type", "application/json")
        .header("User-Agent", "antigravity/2.10.0")
        .json(&quota_body)
        .send()
        .await
    {
        Ok(r) => r,
        Err(_) => {
            return CloudQuotaResult {
                tier_name,
                is_valid: true,
                ..Default::default()
            };
        }
    };

    if !quota_resp.status().is_success() {
        return CloudQuotaResult {
            tier_name,
            is_valid: true,
            ..Default::default()
        };
    }

    let quota_json: serde_json::Value = match quota_resp.json().await {
        Ok(j) => j,
        Err(_) => {
            return CloudQuotaResult {
                tier_name,
                is_valid: true,
                ..Default::default()
            };
        }
    };

    let mut gemini_weekly: Option<u32> = None;
    let mut gemini_weekly_desc: Option<String> = None;
    let mut gemini_weekly_reset: Option<String> = None;
    let mut gemini_5h: Option<u32> = None;
    let mut gemini_5h_desc: Option<String> = None;
    let mut gemini_5h_reset: Option<String> = None;
    let mut claude_weekly: Option<u32> = None;
    let mut claude_weekly_reset: Option<String> = None;
    let mut claude_5h: Option<u32> = None;

    if let Some(groups) = quota_json.get("groups").and_then(|g| g.as_array()) {
        for g in groups {
            if let Some(buckets) = g.get("buckets").and_then(|b| b.as_array()) {
                for b in buckets {
                    let bucket_id = b.get("bucketId").and_then(|v| v.as_str()).unwrap_or("");
                    let b_desc = b
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    let rem_frac = b
                        .get("remainingFraction")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1.0);
                    let percent = (rem_frac * 100.0).round() as u32;
                    let reset_t = b
                        .get("resetTime")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);

                    match bucket_id {
                        "gemini-weekly" => {
                            gemini_weekly = Some(percent);
                            gemini_weekly_desc = b_desc;
                            gemini_weekly_reset = reset_t;
                        }
                        "gemini-5h" => {
                            gemini_5h = Some(percent);
                            gemini_5h_desc = b_desc;
                            gemini_5h_reset = reset_t;
                        }
                        "3p-weekly" => {
                            claude_weekly = Some(percent);
                            claude_weekly_reset = reset_t;
                        }
                        "3p-5h" => {
                            claude_5h = Some(percent);
                        }
                        _ => {}
                    }
                }
            }
        }
    }

    CloudQuotaResult {
        tier_name,
        gemini_weekly_percent: gemini_weekly,
        gemini_weekly_desc,
        gemini_weekly_reset,
        gemini_5h_percent: gemini_5h,
        gemini_5h_desc,
        gemini_5h_reset,
        claude_weekly_percent: claude_weekly,
        claude_weekly_reset,
        claude_5h_percent: claude_5h,
        is_valid: true,
    }
}

async fn query_account_tier_from_token(token: &str) -> Option<String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(3))
        .build()
        .ok()?;
    let resp = client
        .post("https://cloudcode-pa.googleapis.com/v1internal:loadCodeAssist")
        .header("Authorization", format!("Bearer {token}"))
        .header("Content-Type", "application/json")
        .body("{}")
        .send()
        .await
        .ok()?;

    if resp.status().is_success() {
        let api_json: serde_json::Value = resp.json().await.ok()?;
        if let Some(tiers) = api_json.get("allowedTiers").and_then(|t| t.as_array()) {
            if let Some(first) = tiers.first() {
                if let Some(name) = first.get("name").and_then(|n| n.as_str()) {
                    return Some(name.to_string());
                }
            }
        }
    }
    None
}

#[derive(Debug, Default, Clone)]
pub struct LiveLanguageServerQuota {
    pub groups: Vec<UserQuotaGroup>,
    pub gemini_weekly_percent: Option<u32>,
    pub gemini_weekly_desc: Option<String>,
    pub gemini_weekly_reset: Option<String>,
    pub gemini_5h_percent: Option<u32>,
    pub gemini_5h_desc: Option<String>,
    pub gemini_5h_reset: Option<String>,
    pub claude_weekly_percent: Option<u32>,
    pub claude_weekly_reset: Option<String>,
    pub claude_5h_percent: Option<u32>,
}

fn query_live_language_server_quota() -> Option<LiveLanguageServerQuota> {
    #[cfg(target_os = "macos")]
    {
        // 1. Find the standalone Antigravity language_server (NOT the IDE one)
        //    The main app has --standalone in its args; the IDE has --enable_lsp
        let ps_output = std::process::Command::new("ps").arg("aux").output().ok()?;
        let ps_str = String::from_utf8_lossy(&ps_output.stdout);

        let mut target_csrf: Option<String> = None;
        let mut target_pid: Option<String> = None;

        for line in ps_str.lines() {
            // Must contain language_server, --csrf_token, and --standalone (main app)
            // Exclude IDE server which has --enable_lsp instead
            if line.contains("language_server")
                && line.contains("--csrf_token")
                && line.contains("--standalone")
                && !line.contains("--enable_lsp")
            {
                let parts: Vec<&str> = line.split_whitespace().collect();
                if parts.len() >= 2 {
                    let pid = parts[1].to_string();
                    if let Some(csrf_idx) = line.find("--csrf_token") {
                        let sub = &line[csrf_idx..];
                        let mut tokens = sub.split_whitespace();
                        tokens.next(); // skip --csrf_token
                        if let Some(token) = tokens.next() {
                            target_pid = Some(pid);
                            target_csrf = Some(token.to_string());
                            break;
                        }
                    }
                }
            }
        }

        let (pid, csrf) = (target_pid?, target_csrf?);

        // 2. Find listening port via lsof — pick the LOWEST port (the main HTTPS port)
        let lsof_output = std::process::Command::new("lsof")
            .args(["-Pan", "-p", &pid, "-i"])
            .output()
            .ok()?;
        let lsof_str = String::from_utf8_lossy(&lsof_output.stdout);

        let mut ports: Vec<u16> = Vec::new();
        for line in lsof_str.lines() {
            if line.contains("LISTEN") && line.contains("127.0.0.1:") {
                if let Some(idx) = line.find("127.0.0.1:") {
                    let sub = &line[idx + "127.0.0.1:".len()..];
                    let port_str = sub.split_whitespace().next().unwrap_or("");
                    let port_digits: String = port_str
                        .chars()
                        .take_while(|c| c.is_ascii_digit())
                        .collect();
                    if let Ok(p) = port_digits.parse::<u16>() {
                        ports.push(p);
                    }
                }
            }
        }

        // Use the smallest port (the primary HTTPS server port)
        let port = ports.into_iter().min()?;

        // 3. Call RetrieveUserQuotaSummary via curl
        let curl_output = std::process::Command::new("curl")
            .args([
                "-sk",
                "--max-time", "5",
                "-H", "Content-Type: application/json",
                "-H", "Connect-Protocol-Version: 1",
                "-H", &format!("x-codeium-csrf-token: {csrf}"),
                "-X", "POST",
                &format!("https://127.0.0.1:{port}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary"),
                "-d", "{}",
            ])
            .output()
            .ok()?;

        if !curl_output.status.success() {
            return None;
        }

        let json: serde_json::Value = serde_json::from_slice(&curl_output.stdout).ok()?;

        // Check for error response (e.g. CSRF mismatch)
        if json.get("code").is_some() {
            return None;
        }

        let groups_val = json.get("response")?.get("groups")?.as_array()?;

        let mut groups = Vec::new();
        let mut gemini_weekly: Option<u32> = None;
        let mut gemini_weekly_desc: Option<String> = None;
        let mut gemini_weekly_reset: Option<String> = None;
        let mut gemini_5h: Option<u32> = None;
        let mut gemini_5h_desc: Option<String> = None;
        let mut gemini_5h_reset: Option<String> = None;
        let mut claude_weekly: Option<u32> = None;
        let mut claude_weekly_reset: Option<String> = None;
        let mut claude_5h: Option<u32> = None;

        for g in groups_val {
            let display_name = g
                .get("displayName")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_string();
            let description = g
                .get("description")
                .and_then(|v| v.as_str())
                .map(str::to_string);
            let mut buckets = Vec::new();

            if let Some(raw_buckets) = g.get("buckets").and_then(|v| v.as_array()) {
                for b in raw_buckets {
                    let bucket_id = b
                        .get("bucketId")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let b_display_name = b
                        .get("displayName")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let b_description = b
                        .get("description")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);
                    let window = b
                        .get("window")
                        .and_then(|v| v.as_str())
                        .unwrap_or("")
                        .to_string();
                    let remaining_fraction = b
                        .get("remainingFraction")
                        .and_then(|v| v.as_f64())
                        .unwrap_or(1.0);
                    let percent = (remaining_fraction * 100.0).round() as u32;
                    let reset_time = b
                        .get("resetTime")
                        .and_then(|v| v.as_str())
                        .map(str::to_string);

                    match bucket_id.as_str() {
                        "gemini-weekly" => {
                            gemini_weekly = Some(percent);
                            gemini_weekly_desc = b_description.clone();
                            gemini_weekly_reset = reset_time.clone();
                        }
                        "gemini-5h" => {
                            gemini_5h = Some(percent);
                            gemini_5h_desc = b_description.clone();
                            gemini_5h_reset = reset_time.clone();
                        }
                        "3p-weekly" => {
                            claude_weekly = Some(percent);
                            claude_weekly_reset = reset_time.clone();
                        }
                        "3p-5h" => {
                            claude_5h = Some(percent);
                        }
                        _ => {}
                    }

                    buckets.push(UserQuotaBucket {
                        bucket_id,
                        display_name: b_display_name,
                        description: b_description,
                        window,
                        remaining_fraction,
                        remaining_percent: percent,
                        reset_time,
                    });
                }
            }

            groups.push(UserQuotaGroup {
                display_name,
                description,
                buckets,
            });
        }

        return Some(LiveLanguageServerQuota {
            groups,
            gemini_weekly_percent: gemini_weekly,
            gemini_weekly_desc,
            gemini_weekly_reset,
            gemini_5h_percent: gemini_5h,
            gemini_5h_desc,
            gemini_5h_reset,
            claude_weekly_percent: claude_weekly,
            claude_weekly_reset,
            claude_5h_percent: claude_5h,
        });
    }
    #[allow(unreachable_code)]
    None
}

#[tauri::command]
async fn list_accounts_with_quota(
    state: State<'_, AppState>,
) -> Result<Vec<AccountWithQuotaInfo>, String> {
    let accounts_list = state.db.list_accounts().map_err(|e| e.to_string())?;

    let tasks = accounts_list.into_iter().map(|acc| async move {
        match accounts::get_or_refresh_profile_access_token(&acc.id, acc.is_active).await {
            Ok(access_token) => {
                let quota = query_cloud_account_quota(&access_token).await;
                AccountWithQuotaInfo {
                    id: acc.id,
                    email: acc.email,
                    label: acc.label,
                    is_active: acc.is_active,
                    tier_name: quota.tier_name,
                    gemini_5h_percent: quota.gemini_5h_percent,
                    gemini_5h_desc: quota.gemini_5h_desc,
                    gemini_5h_reset: quota.gemini_5h_reset,
                    gemini_weekly_percent: quota.gemini_weekly_percent,
                    gemini_weekly_desc: quota.gemini_weekly_desc,
                    gemini_weekly_reset: quota.gemini_weekly_reset,
                    claude_5h_percent: quota.claude_5h_percent,
                    claude_weekly_percent: quota.claude_weekly_percent,
                    claude_weekly_reset: quota.claude_weekly_reset,
                    last_used_at: acc.last_used_at,
                    is_valid: quota.is_valid,
                }
            }
            Err(_) => AccountWithQuotaInfo {
                id: acc.id,
                email: acc.email,
                label: acc.label,
                is_active: acc.is_active,
                tier_name: "Standard".to_string(),
                gemini_5h_percent: None,
                gemini_5h_desc: None,
                gemini_5h_reset: None,
                gemini_weekly_percent: None,
                gemini_weekly_desc: None,
                gemini_weekly_reset: None,
                claude_5h_percent: None,
                claude_weekly_percent: None,
                claude_weekly_reset: None,
                last_used_at: acc.last_used_at,
                is_valid: false,
            },
        }
    });

    let results = futures::future::join_all(tasks).await;
    Ok(results)
}

#[tauri::command]
async fn get_user_quota() -> Result<UserQuotaInfo, String> {
    let mut email = None;

    // 1. Try reading active email from ~/.gemini/google_accounts.json
    if let Some(home) = dirs::home_dir() {
        let accounts_path = home.join(".gemini/google_accounts.json");
        if let Ok(content) = fs::read_to_string(accounts_path) {
            if let Ok(json) = serde_json::from_str::<serde_json::Value>(&content) {
                if let Some(active) = json.get("active").and_then(|a| a.as_str()) {
                    email = Some(active.to_string());
                }
            }
        }
    }

    // 2. Read the active Keychain credential for live token and tier. The secret
    // stays in Rust and is never emitted through Tauri IPC or application logs.
    let mut is_authenticated = false;
    let mut tier_name = "Gemini Code Assist Standard".to_string();

    if let Ok(raw) = accounts::read_active_credential() {
        let b64 = raw.strip_prefix("go-keyring-base64:").unwrap_or(&raw);
        use base64::Engine;
        if let Ok(decoded) = base64::engine::general_purpose::STANDARD.decode(b64.as_bytes()) {
            if let Ok(json) = serde_json::from_slice::<serde_json::Value>(&decoded) {
                if let Some(token) = json
                    .get("token")
                    .and_then(|t| t.get("access_token"))
                    .and_then(|a| a.as_str())
                {
                    is_authenticated = true;
                    if let Some(t) = query_account_tier_from_token(token).await {
                        tier_name = t;
                    }
                }
            }
        }
    }

    if email.is_some() {
        is_authenticated = true;
    }

    // 3. Query live language server quota — None means "unavailable" (do not use stale defaults)
    let live_quota = query_live_language_server_quota().unwrap_or_default();

    Ok(UserQuotaInfo {
        account_email: email,
        tier_name,
        groups: live_quota.groups,
        gemini_weekly_percent: live_quota.gemini_weekly_percent,
        gemini_weekly_desc: live_quota.gemini_weekly_desc,
        gemini_5h_percent: live_quota.gemini_5h_percent,
        gemini_5h_desc: live_quota.gemini_5h_desc,
        claude_weekly_percent: live_quota.claude_weekly_percent,
        claude_5h_percent: live_quota.claude_5h_percent,
        is_authenticated,
    })
}

#[tauri::command]
async fn pick_folder(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog().file().pick_folder(move |folder_path| {
        let res = folder_path.map(|p| match p {
            tauri_plugin_dialog::FilePath::Path(path_buf) => path_buf.to_string_lossy().to_string(),
            tauri_plugin_dialog::FilePath::Url(url) => url.path().to_string(),
        });
        let _ = tx.send(res);
    });
    rx.await.map_err(|e| e.to_string())
}

pub fn run() {
    let app_data_dir = app_data_dir();

    let db_path = app_data_dir.join("codex.db");
    let db = match Database::new(db_path) {
        Ok(d) => Arc::new(d),
        Err(e) => {
            eprintln!("Failed to initialize database: {e}");
            panic!("Database init failed: {e}");
        }
    };

    if let Err(error) = accounts::recover_pending_switch(&db) {
        eprintln!("Account switch recovery is pending: {error}");
    }

    let session = Arc::new(AgySession::new());
    let oauth_state = Arc::new(OAuthFlowState::new());
    let state = AppState {
        session: session.clone(),
        db: db.clone(),
        account_switch_lock: tokio::sync::Mutex::new(()),
        oauth_state,
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .manage(state)
        .setup(|app| {
            BrainWatcher::start_watching(app.handle().clone());
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            start_session,
            save_pasted_image,
            send_prompt,
            send_raw_json,
            stop_session,
            is_session_running,
            get_current_session_info,
            list_models,
            list_agents,
            list_accounts,
            import_active_account,
            start_google_oauth,
            cancel_google_oauth,
            submit_manual_auth_code,
            refresh_account_token,
            open_official_antigravity_login,
            switch_active_account,
            remove_account,
            list_projects,
            add_project,
            remove_project,
            list_sessions,
            save_session,
            get_setting,
            set_setting,
            read_file_content,
            write_file_content,
            get_workspace_files,
            get_brain_artifacts,
            read_brain_artifact,
            get_conversation_transcript,
            get_raw_transcript_text,
            get_user_quota,
            list_accounts_with_quota,
            pick_folder
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
