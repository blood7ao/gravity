use std::process::Command;
fn main() {
    let ps_output = Command::new("ps").arg("aux").output().unwrap();
    let ps_str = String::from_utf8_lossy(&ps_output.stdout);
    for line in ps_str.lines() {
        if line.contains("language_server") && line.contains("--standalone") && !line.contains("--enable_lsp") {
            let parts: Vec<&str> = line.split_whitespace().collect();
            if parts.len() >= 2 {
                println!("Killing PID: {}", parts[1]);
                // Command::new("kill").args(["-9", parts[1]]).output().ok();
            }
        }
    }
}
