use std::fs;
use std::io::Write;
use std::path::Path;
use std::process::Command;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use chrono::DateTime;
use keyring::Entry;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use super::db::{AccountRecord, AccountSwitchJournal, Database};

const ACTIVE_KEYCHAIN_SERVICE: &str = "gemini";
const ACTIVE_KEYCHAIN_ACCOUNT: &str = "antigravity";
const VAULT_KEYCHAIN_SERVICE: &str = "antigravity-codex.account";

#[derive(Debug, Serialize, Deserialize)]
struct KeyringPayload {
    token: OAuthToken,
}

#[derive(Debug, Serialize, Deserialize)]
struct OAuthToken {
    access_token: String,
    refresh_token: String,
    #[serde(default)]
    token_type: Option<String>,
    expiry: String,
}

#[derive(Debug, Serialize)]
struct OAuthCredentialsFile<'a> {
    access_token: &'a str,
    refresh_token: &'a str,
    token_type: String,
    expiry_date: i64,
    scope: &'static str,
}

#[derive(Debug, Deserialize, Serialize)]
struct GoogleAccountsFile {
    active: String,
    #[serde(default)]
    old: Vec<String>,
}

#[allow(dead_code)]
fn keychain_entry(service: &str, account: &str) -> Result<Entry, String> {
    Entry::new(service, account).map_err(|error| format!("Keychain is unavailable: {error}"))
}

/// Read the credential used by agy without exposing it over Tauri IPC or logging it.
pub fn read_active_credential() -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                ACTIVE_KEYCHAIN_SERVICE,
                "-a",
                ACTIVE_KEYCHAIN_ACCOUNT,
                "-w",
            ])
            .output()
            .map_err(|error| format!("Could not read the macOS login Keychain: {error}"))?;
        if !output.status.success() {
            return Err("No active Antigravity credential in the macOS login Keychain".to_string());
        }
        String::from_utf8(output.stdout)
            .map(|value| value.trim().to_string())
            .map_err(|_| "The active Keychain credential is not valid UTF-8".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    keychain_entry(ACTIVE_KEYCHAIN_SERVICE, ACTIVE_KEYCHAIN_ACCOUNT)?
        .get_password()
        .map_err(|error| format!("No active Antigravity credential in Keychain: {error}"))
}

fn write_active_credential(value: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                ACTIVE_KEYCHAIN_SERVICE,
                "-a",
                ACTIVE_KEYCHAIN_ACCOUNT,
                "-w",
                value,
            ])
            .output()
            .map_err(|error| format!("Could not update the macOS login Keychain: {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "Could not update the active Antigravity credential".to_string()
            } else {
                format!("Could not update the active Antigravity credential: {detail}")
            });
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    keychain_entry(ACTIVE_KEYCHAIN_SERVICE, ACTIVE_KEYCHAIN_ACCOUNT)?
        .set_password(value)
        .map_err(|error| format!("Could not update the active Antigravity credential: {error}"))
}

fn store_profile_credential(profile_id: &str, value: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "add-generic-password",
                "-U",
                "-s",
                VAULT_KEYCHAIN_SERVICE,
                "-a",
                profile_id,
                "-w",
                value,
            ])
            .output()
            .map_err(|error| format!("Could not store the account in Keychain: {error}"))?;
        if !output.status.success() {
            let detail = String::from_utf8_lossy(&output.stderr).trim().to_string();
            return Err(if detail.is_empty() {
                "Could not store the account in Keychain".to_string()
            } else {
                format!("Could not store the account in Keychain: {detail}")
            });
        }
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    keychain_entry(VAULT_KEYCHAIN_SERVICE, profile_id)?
        .set_password(value)
        .map_err(|error| format!("Could not store the account in Keychain: {error}"))
}

pub fn get_profile_access_token(profile_id: &str) -> Result<String, String> {
    let credential = read_profile_credential(profile_id)?;
    let payload = decode_payload(&credential)?;
    Ok(payload.token.access_token)
}

pub async fn get_or_refresh_profile_access_token(
    db: &Database,
    profile_id: &str,
    is_active: bool,
) -> Result<String, String> {
    let credential = read_profile_credential(profile_id)?;
    let mut payload = decode_payload(&credential)?;

    let is_expired = if let Ok(expiry) = DateTime::parse_from_rfc3339(&payload.token.expiry) {
        let now = chrono::Utc::now();
        expiry <= (now + chrono::Duration::minutes(5))
    } else {
        true
    };

    if is_expired && !payload.token.refresh_token.is_empty() {
        let proxy = crate::process::proxy::ProxyConfig::load_from_db(db);
        if let Ok(refreshed) = crate::auth::oauth::refresh_google_token(&payload.token.refresh_token, Some(&proxy)).await {
            payload.token.access_token = refreshed.access_token.clone();
            payload.token.expiry = refreshed.expiry_iso;
            if let Ok(new_cred) = format_keyring_payload(
                &payload.token.access_token,
                &payload.token.refresh_token,
                &payload.token.expiry,
            ) {
                let _ = store_profile_credential(profile_id, &new_cred);
                if is_active {
                    let _ = write_active_credential(&new_cred);
                    if let Ok(email) = active_email() {
                        let _ = sync_file_credentials(&email, &new_cred);
                    }
                }
            }
            return Ok(refreshed.access_token);
        }
    }

    Ok(payload.token.access_token)
}

fn read_profile_credential(profile_id: &str) -> Result<String, String> {
    #[cfg(target_os = "macos")]
    {
        let output = Command::new("security")
            .args([
                "find-generic-password",
                "-s",
                VAULT_KEYCHAIN_SERVICE,
                "-a",
                profile_id,
                "-w",
            ])
            .output()
            .map_err(|error| format!("Could not read the account from Keychain: {error}"))?;
        if !output.status.success() {
            return Err("The account credential in Keychain is missing or expired. Please re-authenticate.".to_string());
        }
        String::from_utf8(output.stdout)
            .map(|value| value.trim().to_string())
            .map_err(|_| "The Keychain credential is not valid UTF-8".to_string())
    }

    #[cfg(not(target_os = "macos"))]
    keychain_entry(VAULT_KEYCHAIN_SERVICE, profile_id)?
        .get_password()
        .map_err(|error| format!("The saved account credential is unavailable: {error}"))
}

fn delete_profile_credential(profile_id: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        let _ = Command::new("security")
            .args([
                "delete-generic-password",
                "-s",
                VAULT_KEYCHAIN_SERVICE,
                "-a",
                profile_id,
            ])
            .output();
        Ok(())
    }

    #[cfg(not(target_os = "macos"))]
    match keychain_entry(VAULT_KEYCHAIN_SERVICE, profile_id)?.delete_credential() {
        Ok(()) => Ok(()),
        // A profile with no keychain entry is already safely removed from the vault.
        Err(keyring::Error::NoEntry) => Ok(()),
        Err(error) => Err(format!(
            "Could not remove the saved account credential: {error}"
        )),
    }
}

fn decode_payload(value: &str) -> Result<KeyringPayload, String> {
    let encoded = value.strip_prefix("go-keyring-base64:").unwrap_or(value);
    let decoded = STANDARD
        .decode(encoded.as_bytes())
        .map_err(|_| "The active credential has an unsupported format".to_string())?;
    serde_json::from_slice(&decoded)
        .map_err(|_| "The active credential has an unsupported format".to_string())
}

fn active_email() -> Result<String, String> {
    let home = dirs::home_dir().ok_or("Could not determine the home directory")?;
    let path = home.join(".gemini/google_accounts.json");
    let raw = fs::read_to_string(&path).map_err(|_| {
        "Could not determine the email for the active Antigravity account".to_string()
    })?;
    let accounts: GoogleAccountsFile = serde_json::from_str(&raw)
        .map_err(|_| "The active account file has an unsupported format".to_string())?;
    let email = accounts.active.trim();
    if email.is_empty() {
        return Err("The active Antigravity account has no email address".to_string());
    }
    Ok(email.to_string())
}

fn atomic_write(path: &Path, contents: &[u8]) -> Result<(), String> {
    let parent = path
        .parent()
        .ok_or("Credential path has no parent directory")?;
    fs::create_dir_all(parent)
        .map_err(|error| format!("Could not create credential directory: {error}"))?;

    let file_name = path
        .file_name()
        .and_then(|name| name.to_str())
        .ok_or("Credential path is invalid")?;
    let temp_path = parent.join(format!(".{file_name}.{}.tmp", Uuid::new_v4()));
    let write_result = (|| -> Result<(), String> {
        let mut options = fs::OpenOptions::new();
        options.write(true).create_new(true);
        #[cfg(unix)]
        {
            use std::os::unix::fs::OpenOptionsExt;
            options.mode(0o600);
        }
        let mut file = options
            .open(&temp_path)
            .map_err(|error| format!("Could not write credential file: {error}"))?;
        file.write_all(contents)
            .map_err(|error| format!("Could not write credential file: {error}"))?;
        file.sync_all()
            .map_err(|error| format!("Could not sync credential file: {error}"))?;
        fs::rename(&temp_path, path)
            .map_err(|error| format!("Could not activate credential file: {error}"))?;
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            fs::set_permissions(path, fs::Permissions::from_mode(0o600))
                .map_err(|error| format!("Could not secure credential file: {error}"))?;
        }
        Ok(())
    })();

    if write_result.is_err() {
        let _ = fs::remove_file(&temp_path);
    }
    write_result
}

fn sync_file_credentials(email: &str, value: &str) -> Result<(), String> {
    let payload = decode_payload(value)?;
    let expiry = DateTime::parse_from_rfc3339(&payload.token.expiry)
        .map_err(|_| "The saved account credential has an invalid expiry time")?
        .timestamp_millis();
    let home = dirs::home_dir().ok_or("Could not determine the home directory")?;
    let gemini_dir = home.join(".gemini");

    let oauth_contents = serde_json::to_vec_pretty(&OAuthCredentialsFile {
        access_token: &payload.token.access_token,
        refresh_token: &payload.token.refresh_token,
        token_type: payload.token.token_type.unwrap_or_else(|| "Bearer".to_string()),
        expiry_date: expiry,
        scope: "https://www.googleapis.com/auth/userinfo.email openid https://www.googleapis.com/auth/cloud-platform https://www.googleapis.com/auth/userinfo.profile",
    })
    .map_err(|error| format!("Could not prepare credential file: {error}"))?;
    atomic_write(&gemini_dir.join("oauth_creds.json"), &oauth_contents)?;

    let accounts_path = gemini_dir.join("google_accounts.json");
    let mut account_file = fs::read_to_string(&accounts_path)
        .ok()
        .and_then(|contents| serde_json::from_str::<GoogleAccountsFile>(&contents).ok())
        .unwrap_or(GoogleAccountsFile {
            active: String::new(),
            old: Vec::new(),
        });
    let previous = account_file.active.trim().to_string();
    account_file.active = email.to_string();
    account_file
        .old
        .retain(|value| value != email && value != &previous);
    if !previous.is_empty() && previous != email {
        account_file.old.insert(0, previous);
    }
    let account_contents = serde_json::to_vec_pretty(&account_file)
        .map_err(|error| format!("Could not prepare account file: {error}"))?;
    atomic_write(&accounts_path, &account_contents)
}

fn apply_profile(profile: &AccountRecord, credential: &str) -> Result<(), String> {
    // The native Keychain API keeps the secret out of process arguments and browser-facing IPC.
    write_active_credential(credential)?;
    sync_file_credentials(&profile.email, credential)
}

pub fn format_keyring_payload(
    access_token: &str,
    refresh_token: &str,
    expiry_iso: &str,
) -> Result<String, String> {
    let payload = KeyringPayload {
        token: OAuthToken {
            access_token: access_token.to_string(),
            refresh_token: refresh_token.to_string(),
            token_type: Some("Bearer".to_string()),
            expiry: expiry_iso.to_string(),
        },
    };
    let json_bytes = serde_json::to_vec(&payload)
        .map_err(|e| format!("Failed to serialize keyring payload: {e}"))?;
    let encoded = STANDARD.encode(&json_bytes);
    Ok(format!("go-keyring-base64:{}", encoded))
}

pub fn save_and_activate_oauth_account(
    db: &Database,
    email: &str,
    label: &str,
    access_token: &str,
    refresh_token: &str,
    expiry_iso: &str,
) -> Result<AccountRecord, String> {
    let credential = format_keyring_payload(access_token, refresh_token, expiry_iso)?;

    let existing = db
        .get_account_by_email(email)
        .map_err(|error| error.to_string())?;
    let profile_id = existing
        .as_ref()
        .map(|profile| profile.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());

    store_profile_credential(&profile_id, &credential)?;

    let account = db
        .upsert_imported_active_account(&profile_id, email, label)
        .map_err(|error| error.to_string())?;

    apply_profile(&account, &credential)?;
    Ok(account)
}

pub fn import_active_account(db: &Database) -> Result<AccountRecord, String> {
    let email = active_email()?;
    let credential = read_active_credential()?;
    decode_payload(&credential)?;

    let existing = db
        .get_account_by_email(&email)
        .map_err(|error| error.to_string())?;
    let profile_id = existing
        .as_ref()
        .map(|profile| profile.id.clone())
        .unwrap_or_else(|| Uuid::new_v4().to_string());
    store_profile_credential(&profile_id, &credential)?;

    db.upsert_imported_active_account(&profile_id, &email, &email)
        .map_err(|error| error.to_string())
}

pub fn list_accounts(db: &Database) -> Result<Vec<AccountRecord>, String> {
    db.list_accounts().map_err(|error| error.to_string())
}

pub fn remove_account(db: &Database, profile_id: &str) -> Result<(), String> {
    let profile = db
        .get_account(profile_id)
        .map_err(|error| error.to_string())?
        .ok_or("Account not found")?;
    if profile.is_active {
        return Err("Switch to another account before removing the active account".to_string());
    }
    delete_profile_credential(profile_id)?;
    db.delete_account(profile_id)
        .map_err(|error| error.to_string())
}

pub async fn switch_account(db: &Database, profile_id: &str) -> Result<AccountRecord, String> {
    let target = db
        .get_account(profile_id)
        .map_err(|error| error.to_string())?
        .ok_or("Account not found")?;

    let mut credential = read_profile_credential(&target.id)?;
    if let Ok(mut payload) = decode_payload(&credential) {
        let is_expired = if let Ok(expiry) = DateTime::parse_from_rfc3339(&payload.token.expiry) {
            let now = chrono::Utc::now();
            expiry <= (now + chrono::Duration::minutes(5))
        } else {
            true
        };

        if is_expired && !payload.token.refresh_token.is_empty() {
            let proxy = crate::process::proxy::ProxyConfig::load_from_db(db);
            if let Ok(refreshed) = crate::auth::oauth::refresh_google_token(&payload.token.refresh_token, Some(&proxy)).await {
                payload.token.access_token = refreshed.access_token;
                payload.token.expiry = refreshed.expiry_iso;
                if let Ok(new_cred) = format_keyring_payload(
                    &payload.token.access_token,
                    &payload.token.refresh_token,
                    &payload.token.expiry,
                ) {
                    let _ = store_profile_credential(&target.id, &new_cred);
                    credential = new_cred;
                }
            }
        }
    }

    if target.is_active {
        let _ = apply_profile(&target, &credential);
        return Ok(target);
    }

    let previous = db.get_active_account().map_err(|error| error.to_string())?;
    let journal = AccountSwitchJournal {
        previous_account_id: previous.as_ref().map(|account| account.id.clone()),
        target_account_id: target.id.clone(),
        phase: "applying".to_string(),
        created_at: chrono::Utc::now().timestamp_millis(),
    };
    db.save_switch_journal(&journal)
        .map_err(|error| error.to_string())?;

    if let Err(error) = apply_profile(&target, &credential) {
        let rollback_result = previous
            .as_ref()
            .map(|account| {
                read_profile_credential(&account.id)
                    .and_then(|old_credential| apply_profile(account, &old_credential))
            })
            .transpose();
        if rollback_result.as_ref().is_ok() {
            let _ = db.clear_switch_journal();
        }
        return match rollback_result {
            Ok(_) if previous.is_some() => Err(format!(
                "Could not switch account; the previous account was restored: {error}"
            )),
            Ok(_) => Err(format!("Could not switch account: {error}")),
            Err(rollback_error) => Err(format!(
                "Could not switch account: {error}. Recovery is required: {rollback_error}"
            )),
        };
    }

    db.set_active_account(&target.id)
        .map_err(|error| error.to_string())?;
    db.clear_switch_journal()
        .map_err(|error| error.to_string())?;
    db.get_account(&target.id)
        .map_err(|error| error.to_string())?
        .ok_or("The switched account could not be reloaded".to_string())
}

pub async fn refresh_account(db: &Database, profile_id: &str) -> Result<AccountRecord, String> {
    let target = db
        .get_account(profile_id)
        .map_err(|error| error.to_string())?
        .ok_or("Account not found")?;

    let credential = read_profile_credential(&target.id)?;
    let mut payload = decode_payload(&credential)?;

    if payload.token.refresh_token.is_empty() {
        return Err("This account does not have a refresh token".to_string());
    }

    let proxy = crate::process::proxy::ProxyConfig::load_from_db(db);
    let refreshed = crate::auth::oauth::refresh_google_token(&payload.token.refresh_token, Some(&proxy)).await?;
    payload.token.access_token = refreshed.access_token;
    payload.token.expiry = refreshed.expiry_iso;

    let new_cred = format_keyring_payload(
        &payload.token.access_token,
        &payload.token.refresh_token,
        &payload.token.expiry,
    )?;

    store_profile_credential(&target.id, &new_cred)?;

    if target.is_active {
        apply_profile(&target, &new_cred)?;
    }

    Ok(target)
}

pub fn recover_pending_switch(db: &Database) -> Result<(), String> {
    let Some(journal) = db.get_switch_journal().map_err(|error| error.to_string())? else {
        return Ok(());
    };
    let target = db
        .get_account(&journal.target_account_id)
        .map_err(|error| error.to_string())?
        .ok_or("An unfinished account switch references a missing account")?;
    let credential = read_profile_credential(&target.id)?;
    apply_profile(&target, &credential)?;
    db.set_active_account(&target.id)
        .map_err(|error| error.to_string())?;
    db.clear_switch_journal().map_err(|error| error.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn decodes_go_keyring_payload_without_exposing_secrets() {
        let json = r#"{"token":{"access_token":"access","refresh_token":"refresh","expiry":"2030-01-01T00:00:00.000000Z"}}"#;
        let encoded = format!("go-keyring-base64:{}", STANDARD.encode(json));
        let payload = decode_payload(&encoded).expect("payload should decode");
        assert_eq!(payload.token.token_type, None);
        assert_eq!(payload.token.expiry, "2030-01-01T00:00:00.000000Z");
    }
}
