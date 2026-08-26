#[tokio::main]
async fn main() {
    let token = std::env::var("GOOGLE_OAUTH_TOKEN").unwrap_or_default();
    if token.is_empty() { return; }
    let client = reqwest::Client::builder().timeout(std::time::Duration::from_secs(3)).build().unwrap();
    let resp = client.post("https://cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary")
        .header("Authorization", format!("Bearer {}", token))
        .header("Content-Type", "application/json")
        .body("{}")
        .send().await.unwrap();
    let text = resp.text().await.unwrap();
    println!("{}", text);
}
