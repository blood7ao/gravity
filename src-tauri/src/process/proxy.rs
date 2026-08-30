use std::collections::HashMap;
use std::net::{SocketAddr, TcpStream, ToSocketAddrs};
use std::time::Duration;
use serde::{Deserialize, Serialize};
use crate::storage::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct ProxyConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
}

impl Default for ProxyConfig {
    fn default() -> Self {
        Self {
            // A reachable local port is not necessarily an unauthenticated HTTP proxy.
            // Keep new installs on the system/default network path until the user has
            // explicitly opted in to proxy routing.
            enabled: false,
            host: "127.0.0.1".to_string(),
            port: 7890,
        }
    }
}

impl ProxyConfig {
    /// Brackets a raw IPv6 host so it is valid in a URL authority (`[::1]`),
    /// leaving IPv4 hosts, hostnames and already-bracketed values untouched.
    fn format_host_str(host: &str) -> String {
        if host.contains(':') && !host.starts_with('[') {
            format!("[{host}]")
        } else {
            host.to_string()
        }
    }

    fn format_host(&self) -> String {
        Self::format_host_str(&self.host)
    }

    pub fn http_url(&self) -> String {
        format!("http://{}:{}", self.format_host(), self.port)
    }

    pub fn socks_url(&self) -> String {
        format!("socks5://{}:{}", self.format_host(), self.port)
    }

    pub fn no_proxy(&self) -> &str {
        "127.0.0.1,localhost,::1"
    }

    pub fn chromium_arguments(&self) -> Vec<String> {
        if self.enabled {
            vec![format!("--proxy-server={}", self.http_url())]
        } else {
            Vec::new()
        }
    }

    pub fn apply_to_env(&self, envs: &mut HashMap<String, String>) {
        if self.enabled {
            let http = self.http_url();
            let socks = self.socks_url();
            let no_proxy = self.no_proxy().to_string();

            envs.insert("HTTP_PROXY".to_string(), http.clone());
            envs.insert("HTTPS_PROXY".to_string(), http.clone());
            envs.insert("ALL_PROXY".to_string(), socks.clone());
            envs.insert("NO_PROXY".to_string(), no_proxy.clone());

            envs.insert("http_proxy".to_string(), http.clone());
            envs.insert("https_proxy".to_string(), http.clone());
            envs.insert("all_proxy".to_string(), socks);
            envs.insert("no_proxy".to_string(), no_proxy);

            #[cfg(target_os = "windows")]
            {
                envs.insert(
                    "WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS".to_string(),
                    format!("--proxy-server={http}"),
                );
            }
        }
    }

    pub fn check_reachability(host: &str, port: u16, timeout_ms: u64) -> bool {
        let addr_str = format!("{}:{}", Self::format_host_str(host), port);

        let timeout = Duration::from_millis(timeout_ms);

        if let Ok(addrs) = addr_str.to_socket_addrs() {
            for addr in addrs {
                if TcpStream::connect_timeout(&addr, timeout).is_ok() {
                    return true;
                }
            }
        }

        // Fallback for direct IPv4 parsing if hostname resolution fails
        if let Ok(ip) = host.parse::<std::net::IpAddr>() {
            let socket_addr = SocketAddr::new(ip, port);
            return TcpStream::connect_timeout(&socket_addr, timeout).is_ok();
        }

        false
    }

    pub fn is_reachable(&self) -> bool {
        Self::check_reachability(&self.host, self.port, 450)
    }

    pub fn build_http_client(&self, timeout: Duration) -> Result<reqwest::Client, String> {
        let mut builder = reqwest::Client::builder().timeout(timeout);

        if self.enabled {
            let proxy = reqwest::Proxy::all(self.http_url())
                .map_err(|e| format!("Failed to parse proxy URL: {e}"))?;
            let no_proxy = reqwest::NoProxy::from_string(self.no_proxy());
            builder = builder.proxy(proxy.no_proxy(no_proxy));
        }

        builder
            .build()
            .map_err(|e| format!("Failed to initialize HTTP client: {e}"))
    }

    pub fn load_from_db(db: &Database) -> Self {
        let enabled = match db.get_setting("proxy_enabled") {
            Ok(Some(val)) => val.trim().eq_ignore_ascii_case("true") || val.trim() == "1",
            // Do not force traffic through a guessed local port. In particular, a
            // proxy that requires Basic authentication returns HTTP 407 during the
            // OAuth token exchange, after the browser authorization has succeeded.
            _ => false,
        };

        let host = match db.get_setting("proxy_host") {
            Ok(Some(val)) if !val.trim().is_empty() => val.trim().to_string(),
            _ => "127.0.0.1".to_string(),
        };

        let port = match db.get_setting("proxy_port") {
            Ok(Some(val)) => val.trim().parse::<u16>().unwrap_or(7890),
            _ => 7890,
        };

        Self {
            enabled,
            host,
            port,
        }
    }

    pub fn save_to_db(&self, db: &Database) -> Result<(), String> {
        db.set_setting("proxy_enabled", if self.enabled { "true" } else { "false" })
            .map_err(|e| e.to_string())?;
        db.set_setting("proxy_host", &self.host)
            .map_err(|e| e.to_string())?;
        db.set_setting("proxy_port", &self.port.to_string())
            .map_err(|e| e.to_string())?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_default_proxy_is_disabled() {
        assert!(!ProxyConfig::default().enabled);
    }

    #[test]
    fn test_proxy_urls_and_env() {
        let proxy = ProxyConfig {
            enabled: true,
            host: "127.0.0.1".to_string(),
            port: 7890,
        };

        assert_eq!(proxy.http_url(), "http://127.0.0.1:7890");
        assert_eq!(proxy.socks_url(), "socks5://127.0.0.1:7890");
        assert_eq!(proxy.no_proxy(), "127.0.0.1,localhost,::1");

        let mut envs = HashMap::new();
        proxy.apply_to_env(&mut envs);

        assert_eq!(envs.get("HTTP_PROXY"), Some(&"http://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("HTTPS_PROXY"), Some(&"http://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("ALL_PROXY"), Some(&"socks5://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("NO_PROXY"), Some(&"127.0.0.1,localhost,::1".to_string()));
        assert_eq!(envs.get("http_proxy"), Some(&"http://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("https_proxy"), Some(&"http://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("all_proxy"), Some(&"socks5://127.0.0.1:7890".to_string()));
        assert_eq!(envs.get("no_proxy"), Some(&"127.0.0.1,localhost,::1".to_string()));
    }

    #[test]
    fn test_disabled_proxy_leaves_env_empty() {
        let proxy = ProxyConfig {
            enabled: false,
            host: "127.0.0.1".to_string(),
            port: 7890,
        };

        let mut envs = HashMap::new();
        proxy.apply_to_env(&mut envs);
        assert!(envs.is_empty());
    }

    #[test]
    fn test_ipv6_host_formatting() {
        let proxy = ProxyConfig {
            enabled: true,
            host: "::1".to_string(),
            port: 7890,
        };
        assert_eq!(proxy.http_url(), "http://[::1]:7890");
    }
}
