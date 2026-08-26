use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine as _};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;
use tokio::sync::Mutex;
use url::Url;

pub const GOOGLE_CLIENT_ID: &str =
    "1071006060591-tmhssin2h21lcre235vtolojh4g403ep.apps.googleusercontent.com";
pub const GOOGLE_CLIENT_SECRET: &str = "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";
pub const OAUTH_REDIRECT_PORT: u16 = 51121;
pub const OAUTH_REDIRECT_URI: &str = "http://localhost:51121/oauth-callback";
pub const GOOGLE_AUTH_ENDPOINT: &str = "https://accounts.google.com/o/oauth2/v2/auth";
pub const GOOGLE_TOKEN_ENDPOINT: &str = "https://oauth2.googleapis.com/token";
pub const GOOGLE_USERINFO_ENDPOINT: &str = "https://www.googleapis.com/oauth2/v2/userinfo";
pub const GOOGLE_SCOPES: &[&str] = &[
    "openid",
    "https://www.googleapis.com/auth/userinfo.email",
    "https://www.googleapis.com/auth/userinfo.profile",
    "https://www.googleapis.com/auth/cloud-platform",
];

#[derive(Debug, Clone)]
pub struct PkcePair {
    pub verifier: String,
    pub challenge: String,
    pub state: String,
}

#[derive(Debug, Deserialize)]
pub struct GoogleTokenResponse {
    pub access_token: String,
    pub refresh_token: Option<String>,
    pub expires_in: Option<i64>,
    pub token_type: Option<String>,
    pub scope: Option<String>,
    pub id_token: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct GoogleUserInfo {
    pub email: String,
    #[serde(default)]
    pub name: Option<String>,
    #[serde(default)]
    pub picture: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct OAuthExchangeResult {
    pub email: String,
    pub name: String,
    pub access_token: String,
    pub refresh_token: String,
    pub expiry_iso: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct RefreshedToken {
    pub access_token: String,
    pub expiry_iso: String,
}

#[derive(Default)]
pub struct OAuthFlowState {
    pub active_verifier: Mutex<Option<String>>,
    pub active_state: Mutex<Option<String>>,
    pub cancel_tx: Mutex<Option<tokio::sync::oneshot::Sender<()>>>,
}

impl OAuthFlowState {
    pub fn new() -> Self {
        Self::default()
    }
}

pub fn generate_pkce() -> PkcePair {
    let mut random_bytes = [0u8; 32];
    rand::thread_rng().fill_bytes(&mut random_bytes);
    let verifier = URL_SAFE_NO_PAD.encode(random_bytes);

    let mut state_bytes = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut state_bytes);
    let state = URL_SAFE_NO_PAD.encode(state_bytes);

    let mut hasher = Sha256::new();
    hasher.update(verifier.as_bytes());
    let hash = hasher.finalize();
    let challenge = URL_SAFE_NO_PAD.encode(hash);

    PkcePair {
        verifier,
        challenge,
        state,
    }
}

pub fn build_authorization_url(challenge: &str, state: &str) -> String {
    let mut url = Url::parse(GOOGLE_AUTH_ENDPOINT).expect("Valid auth endpoint");
    url.query_pairs_mut()
        .append_pair("client_id", GOOGLE_CLIENT_ID)
        .append_pair("redirect_uri", OAUTH_REDIRECT_URI)
        .append_pair("response_type", "code")
        .append_pair("scope", &GOOGLE_SCOPES.join(" "))
        .append_pair("state", state)
        .append_pair("code_challenge", challenge)
        .append_pair("code_challenge_method", "S256")
        .append_pair("access_type", "offline")
        .append_pair("prompt", "consent");
    url.to_string()
}

pub fn open_browser(url: &str) -> Result<(), String> {
    #[cfg(target_os = "macos")]
    {
        std::process::Command::new("open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "windows")]
    {
        std::process::Command::new("cmd")
            .args(["/C", "start", url])
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[cfg(target_os = "linux")]
    {
        std::process::Command::new("xdg-open")
            .arg(url)
            .spawn()
            .map_err(|e| format!("Failed to open browser: {e}"))?;
        return Ok(());
    }

    #[allow(unreachable_code)]
    Err("Unsupported operating system for opening browser".to_string())
}

const SUCCESS_HTML: &str = r#"<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Google 授权成功 - Gravity</title>
  <style>
    * { box-sizing: border-box; }
    body {
      background-color: #09090b;
      color: #f4f4f5;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
      display: flex;
      align-items: center;
      justify-content: center;
      min-height: 100vh;
      margin: 0;
      padding: 24px;
    }
    .card {
      background-color: #18181b;
      border: 1px solid #27272a;
      border-radius: 20px;
      padding: 44px 36px;
      max-width: 460px;
      width: 100%;
      text-align: center;
      box-shadow: 0 25px 50px -12px rgba(0, 0, 0, 0.7);
    }
    .icon {
      width: 60px;
      height: 60px;
      background: linear-gradient(135deg, #a855f7 0%, #7c3aed 100%);
      border-radius: 50%;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 24px;
      color: white;
      box-shadow: 0 10px 20px -5px rgba(168, 85, 247, 0.4);
    }
    h1 {
      font-size: 22px;
      font-weight: 700;
      margin: 0 0 12px 0;
      color: #ffffff;
      letter-spacing: -0.02em;
    }
    p {
      font-size: 14px;
      line-height: 1.6;
      color: #a1a1aa;
      margin: 0 0 28px 0;
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      background-color: #27272a;
      border: 1px solid #3f3f46;
      color: #d4d4d8;
      font-size: 12px;
      padding: 6px 16px;
      border-radius: 9999px;
      font-weight: 500;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
        <polyline points="20 6 9 17 4 12"></polyline>
      </svg>
    </div>
    <h1>Google 账号授权成功</h1>
    <p>凭据已成功同步至本地 Gravity 客户端。<br>您可以关闭此浏览器标签页并返回客户端继续使用。</p>
    <div class="badge">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6"/></svg>
      Gravity Client
    </div>
  </div>
</body>
</html>"#;

pub async fn exchange_code_for_tokens(
    code: &str,
    verifier: &str,
) -> Result<OAuthExchangeResult, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(20))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut params = HashMap::new();
    params.insert("client_id", GOOGLE_CLIENT_ID);
    params.insert("client_secret", GOOGLE_CLIENT_SECRET);
    params.insert("code", code);
    params.insert("code_verifier", verifier);
    params.insert("grant_type", "authorization_code");
    params.insert("redirect_uri", OAUTH_REDIRECT_URI);

    let resp = client
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token exchange request failed: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Token exchange failed: {err_text}"));
    }

    let token_resp: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse token response: {e}"))?;

    let refresh_token = token_resp
        .refresh_token
        .ok_or("No refresh_token returned by Google. Ensure prompt=consent and access_type=offline")?;

    let expires_in = token_resp.expires_in.unwrap_or(3600);
    let expiry_time = chrono::Utc::now() + chrono::Duration::seconds(expires_in);
    let expiry_iso = expiry_time.to_rfc3339_opts(chrono::SecondsFormat::Micros, true);

    let user_resp = client
        .get(GOOGLE_USERINFO_ENDPOINT)
        .bearer_auth(&token_resp.access_token)
        .send()
        .await
        .map_err(|e| format!("Failed to fetch user info: {e}"))?;

    if !user_resp.status().is_success() {
        let err_text = user_resp.text().await.unwrap_or_default();
        return Err(format!("Failed to retrieve user profile: {err_text}"));
    }

    let userinfo: GoogleUserInfo = user_resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse user profile: {e}"))?;

    let name = userinfo
        .name
        .filter(|n| !n.trim().is_empty())
        .unwrap_or_else(|| userinfo.email.clone());

    Ok(OAuthExchangeResult {
        email: userinfo.email,
        name,
        access_token: token_resp.access_token,
        refresh_token,
        expiry_iso,
    })
}

pub async fn refresh_google_token(refresh_token: &str) -> Result<RefreshedToken, String> {
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {e}"))?;

    let mut params = HashMap::new();
    params.insert("client_id", GOOGLE_CLIENT_ID);
    params.insert("client_secret", GOOGLE_CLIENT_SECRET);
    params.insert("refresh_token", refresh_token);
    params.insert("grant_type", "refresh_token");

    let resp = client
        .post(GOOGLE_TOKEN_ENDPOINT)
        .form(&params)
        .send()
        .await
        .map_err(|e| format!("Token refresh request failed: {e}"))?;

    if !resp.status().is_success() {
        let err_text = resp.text().await.unwrap_or_default();
        return Err(format!("Token refresh failed: {err_text}"));
    }

    let token_resp: GoogleTokenResponse = resp
        .json()
        .await
        .map_err(|e| format!("Failed to parse refreshed token: {e}"))?;

    let expires_in = token_resp.expires_in.unwrap_or(3600);
    let expiry_time = chrono::Utc::now() + chrono::Duration::seconds(expires_in);
    let expiry_iso = expiry_time.to_rfc3339_opts(chrono::SecondsFormat::Micros, true);

    Ok(RefreshedToken {
        access_token: token_resp.access_token,
        expiry_iso,
    })
}

pub async fn run_oauth_flow(
    flow_state: Arc<OAuthFlowState>,
) -> Result<OAuthExchangeResult, String> {
    let pkce = generate_pkce();
    *flow_state.active_verifier.lock().await = Some(pkce.verifier.clone());
    *flow_state.active_state.lock().await = Some(pkce.state.clone());

    let (cancel_tx, mut cancel_rx) = tokio::sync::oneshot::channel::<()>();
    *flow_state.cancel_tx.lock().await = Some(cancel_tx);

    let listener = match TcpListener::bind(("127.0.0.1", OAUTH_REDIRECT_PORT)).await {
        Ok(l) => l,
        Err(e) => {
            return Err(format!(
                "Cannot bind local port {} for OAuth redirect: {}. Check if another process is using it, or use manual code entry.",
                OAUTH_REDIRECT_PORT, e
            ));
        }
    };

    let auth_url = build_authorization_url(&pkce.challenge, &pkce.state);
    if let Err(e) = open_browser(&auth_url) {
        eprintln!("Warning: Failed to automatically launch browser: {e}");
    }

    let code_result: Result<String, String> = tokio::select! {
        _ = &mut cancel_rx => {
            Err("OAuth authorization was cancelled".to_string())
        }
        res = tokio::time::timeout(Duration::from_secs(180), async {
            loop {
                let (mut socket, _) = listener.accept().await.map_err(|e| format!("Socket accept error: {e}"))?;
                let mut buffer = [0u8; 4096];
                let bytes_read = socket.read(&mut buffer).await.map_err(|e| format!("Socket read error: {e}"))?;
                let request_str = String::from_utf8_lossy(&buffer[..bytes_read]);

                if let Some(first_line) = request_str.lines().next() {
                    let parts: Vec<&str> = first_line.split_whitespace().collect();
                    if parts.len() >= 2 && parts[0] == "GET" {
                        let path = parts[1];
                        if let Ok(parsed_url) = Url::parse(&format!("http://localhost{}", path)) {
                            let mut code_param = None;
                            let mut state_param = None;
                            let mut error_param = None;

                            for (k, v) in parsed_url.query_pairs() {
                                match k.as_ref() {
                                    "code" => code_param = Some(v.to_string()),
                                    "state" => state_param = Some(v.to_string()),
                                    "error" => error_param = Some(v.to_string()),
                                    _ => {}
                                }
                            }

                            if let Some(err) = error_param {
                                let body = format!("<html><body><h3>Google Login Error: {}</h3></body></html>", err);
                                let response = format!(
                                    "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    body.len(),
                                    body
                                );
                                let _ = socket.write_all(response.as_bytes()).await;
                                return Err(format!("Google authorization denied: {err}"));
                            }

                            if let (Some(code), Some(st)) = (code_param, state_param) {
                                if st != pkce.state {
                                    let body = "<html><body><h3>CSRF State Mismatch</h3></body></html>";
                                    let response = format!(
                                        "HTTP/1.1 400 Bad Request\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                        body.len(),
                                        body
                                    );
                                    let _ = socket.write_all(response.as_bytes()).await;
                                    return Err("CSRF state mismatch in OAuth callback".to_string());
                                }

                                let response = format!(
                                    "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
                                    SUCCESS_HTML.len(),
                                    SUCCESS_HTML
                                );
                                let _ = socket.write_all(response.as_bytes()).await;
                                let _ = socket.flush().await;

                                return Ok(code);
                            }
                        }
                    }
                }
            }
        }) => {
            match res {
                Ok(inner) => inner,
                Err(_) => Err("OAuth authorization timed out (3 minutes). Please try again.".to_string()),
            }
        }
    };

    *flow_state.cancel_tx.lock().await = None;

    let code = code_result?;
    exchange_code_for_tokens(&code, &pkce.verifier).await
}

pub fn extract_code_from_manual_input(input: &str) -> String {
    let trimmed = input.trim();
    if trimmed.starts_with("http://") || trimmed.starts_with("https://") {
        if let Ok(parsed) = Url::parse(trimmed) {
            for (k, v) in parsed.query_pairs() {
                if k == "code" {
                    return v.to_string();
                }
            }
        }
    }
    trimmed.to_string()
}

pub async fn exchange_manual_code(
    code_or_url: &str,
    verifier: Option<&str>,
) -> Result<OAuthExchangeResult, String> {
    let code = extract_code_from_manual_input(code_or_url);
    if code.is_empty() {
        return Err("Authorization code is empty".to_string());
    }

    let default_verifier = "";
    let verifier_to_use = verifier.unwrap_or(default_verifier);
    exchange_code_for_tokens(&code, verifier_to_use).await
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_pkce_generation_and_challenge() {
        let pkce = generate_pkce();
        assert!(!pkce.verifier.is_empty());
        assert!(!pkce.challenge.is_empty());
        assert!(!pkce.state.is_empty());

        let mut hasher = Sha256::new();
        hasher.update(pkce.verifier.as_bytes());
        let expected_challenge = URL_SAFE_NO_PAD.encode(hasher.finalize());
        assert_eq!(pkce.challenge, expected_challenge);
    }

    #[test]
    fn test_build_authorization_url() {
        let url_str = build_authorization_url("test_challenge", "test_state");
        let parsed = Url::parse(&url_str).expect("Valid URL");
        assert_eq!(parsed.host_str(), Some("accounts.google.com"));
        assert_eq!(parsed.path(), "/o/oauth2/v2/auth");

        let query_map: HashMap<String, String> = parsed.query_pairs().into_owned().collect();
        assert_eq!(query_map.get("client_id").unwrap(), GOOGLE_CLIENT_ID);
        assert_eq!(query_map.get("redirect_uri").unwrap(), OAUTH_REDIRECT_URI);
        assert_eq!(query_map.get("response_type").unwrap(), "code");
        assert_eq!(query_map.get("state").unwrap(), "test_state");
        assert_eq!(query_map.get("code_challenge").unwrap(), "test_challenge");
        assert_eq!(query_map.get("code_challenge_method").unwrap(), "S256");
    }

    #[test]
    fn test_extract_code_from_manual_input() {
        assert_eq!(
            extract_code_from_manual_input("4/0AY0e-g7..."),
            "4/0AY0e-g7..."
        );
        assert_eq!(
            extract_code_from_manual_input("http://localhost:51121/oauth-callback?code=4/0AY0e-g7123&state=xyz"),
            "4/0AY0e-g7123"
        );
        assert_eq!(
            extract_code_from_manual_input("https://localhost:51121/oauth-callback?state=xyz&code=abc123def"),
            "abc123def"
        );
    }
}
