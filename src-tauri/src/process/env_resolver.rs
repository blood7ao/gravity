use std::collections::HashMap;
use std::env;
use std::path::PathBuf;

pub fn resolve_system_env() -> HashMap<String, String> {
    let mut envs: HashMap<String, String> = env::vars().collect();

    #[cfg(target_os = "macos")]
    {
        // Enrich PATH for macOS GUI app contexts
        let mut path_entries: Vec<PathBuf> = Vec::new();

        if let Some(home) = dirs::home_dir() {
            path_entries.push(home.join(".local/bin"));
            path_entries.push(home.join(".cargo/bin"));
            path_entries.push(home.join(".gemini/antigravity/bin"));
            path_entries.push(home.join("Library/pnpm"));
            path_entries.push(home.join(".nvm/versions/node/current/bin"));
        }

        path_entries.push(PathBuf::from("/opt/homebrew/bin"));
        path_entries.push(PathBuf::from("/opt/homebrew/sbin"));
        path_entries.push(PathBuf::from("/usr/local/bin"));
        path_entries.push(PathBuf::from("/usr/local/sbin"));
        path_entries.push(PathBuf::from("/usr/bin"));
        path_entries.push(PathBuf::from("/bin"));
        path_entries.push(PathBuf::from("/usr/sbin"));
        path_entries.push(PathBuf::from("/sbin"));

        let current_path = envs.get("PATH").cloned().unwrap_or_default();
        let existing_paths: Vec<String> = env::split_paths(&current_path)
            .map(|p| p.to_string_lossy().to_string())
            .collect();

        let mut combined_paths = existing_paths;
        for candidate in path_entries {
            let candidate_str = candidate.to_string_lossy().to_string();
            if candidate.exists() && !combined_paths.contains(&candidate_str) {
                combined_paths.push(candidate_str);
            }
        }

        let new_path = combined_paths.join(":");
        envs.insert("PATH".to_string(), new_path);
    }

    #[cfg(target_os = "windows")]
    {
        if let Some(home) = dirs::home_dir() {
            let mut paths: Vec<String> = envs
                .get("PATH")
                .map(|p| {
                    env::split_paths(p)
                        .map(|p| p.to_string_lossy().to_string())
                        .collect()
                })
                .unwrap_or_default();

            let local_bin = home.join(".local\\bin").to_string_lossy().to_string();
            let cargo_bin = home.join(".cargo\\bin").to_string_lossy().to_string();

            if !paths.contains(&local_bin) {
                paths.push(local_bin);
            }
            if !paths.contains(&cargo_bin) {
                paths.push(cargo_bin);
            }
            envs.insert("PATH".to_string(), paths.join(";"));
        }
    }

    envs
}
