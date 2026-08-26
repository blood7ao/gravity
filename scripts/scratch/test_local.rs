fn main() {
    let mut target_csrf = None;
    let mut target_pid = None;
    let ps_output = std::process::Command::new("ps").arg("aux").output().unwrap();
    let ps_str = String::from_utf8_lossy(&ps_output.stdout);
    for line in ps_str.lines() {
        if line.contains("language_server") && line.contains("--csrf_token") && line.contains("--standalone") && !line.contains("--enable_lsp") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            let pid = parts[1].to_string();
            if let Some(csrf_idx) = line.find("--csrf_token") {
                let sub = &line[csrf_idx..];
                let mut tokens = sub.split_whitespace();
                tokens.next();
                if let Some(token) = tokens.next() {
                    target_pid = Some(pid);
                    target_csrf = Some(token.to_string());
                    break;
                }
            }
        }
    }
    let pid = target_pid.unwrap();
    let csrf = target_csrf.unwrap();
    let lsof = std::process::Command::new("lsof").args(["-Pan", "-p", &pid, "-i"]).output().unwrap();
    let lsof_str = String::from_utf8_lossy(&lsof.stdout);
    let mut ports: Vec<u16> = Vec::new();
    for line in lsof_str.lines() {
        if line.contains("LISTEN") && line.contains("127.0.0.1:") {
            if let Some(idx) = line.find("127.0.0.1:") {
                let sub = &line[idx + "127.0.0.1:".len()..];
                let port_digits: String = sub.split_whitespace().next().unwrap().chars().take_while(|c| c.is_ascii_digit()).collect();
                if let Ok(p) = port_digits.parse::<u16>() {
                    ports.push(p);
                }
            }
        }
    }
    let port = ports.into_iter().min().unwrap();
    println!("Port: {}, CSRF: {}", port, csrf);
    let curl = std::process::Command::new("curl")
        .args([
            "-sk",
            "-H", "Content-Type: application/json",
            "-H", "Connect-Protocol-Version: 1",
            "-H", &format!("x-codeium-csrf-token: {}", csrf),
            "-X", "POST",
            &format!("https://127.0.0.1:{}/exa.language_server_pb.LanguageServerService/RetrieveUserQuotaSummary", port),
            "-d", "{}"
        ])
        .output().unwrap();
    println!("{}", String::from_utf8_lossy(&curl.stdout));
}
