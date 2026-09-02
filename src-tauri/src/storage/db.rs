use rusqlite::{params, Connection, Result};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProjectRecord {
    pub id: String,
    pub name: String,
    pub path: String,
    pub created_at: i64,
    pub last_opened_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionRecord {
    pub id: String,
    pub project_path: String,
    pub title: String,
    pub created_at: i64,
    pub updated_at: i64,
    pub mode: String,
    pub effort: String,
    pub model: Option<String>,
    pub agent: Option<String>,
    #[serde(default)]
    pub status: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AccountRecord {
    pub id: String,
    pub email: String,
    pub label: String,
    pub is_active: bool,
    pub created_at: i64,
    pub last_used_at: i64,
}

#[derive(Debug, Clone)]
pub struct AccountSwitchJournal {
    pub previous_account_id: Option<String>,
    pub target_account_id: String,
    pub phase: String,
    pub created_at: i64,
}

pub struct Database {
    conn: Mutex<Connection>,
    last_brain_sync: Mutex<Option<std::time::Instant>>,
}

impl Database {
    pub fn new(db_path: PathBuf) -> Result<Self> {
        if let Some(parent) = db_path.parent() {
            let _ = fs::create_dir_all(parent);
        }

        let conn = Connection::open(db_path)?;

        conn.execute_batch(
            "
            CREATE TABLE IF NOT EXISTS projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                path TEXT NOT NULL UNIQUE,
                created_at INTEGER NOT NULL,
                last_opened_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS sessions (
                id TEXT PRIMARY KEY,
                project_path TEXT NOT NULL,
                title TEXT NOT NULL,
                created_at INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                mode TEXT NOT NULL,
                effort TEXT NOT NULL,
                model TEXT,
                agent TEXT
            );

            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS accounts (
                id TEXT PRIMARY KEY,
                email TEXT NOT NULL UNIQUE,
                label TEXT NOT NULL,
                is_active INTEGER NOT NULL DEFAULT 0,
                created_at INTEGER NOT NULL,
                last_used_at INTEGER NOT NULL
            );

            CREATE TABLE IF NOT EXISTS account_switch_journal (
                singleton INTEGER PRIMARY KEY CHECK (singleton = 1),
                previous_account_id TEXT,
                target_account_id TEXT NOT NULL,
                phase TEXT NOT NULL,
                created_at INTEGER NOT NULL
            );
            ",
        )?;

        let has_agent_column = {
            let mut stmt = conn.prepare("PRAGMA table_info(sessions)")?;
            let has_col = stmt
                .query_map([], |row| row.get::<_, String>(1))?
                .filter_map(Result::ok)
                .any(|column| column == "agent");
            has_col
        };
        if !has_agent_column {
            conn.execute("ALTER TABLE sessions ADD COLUMN agent TEXT", [])?;
        }

        Ok(Self {
            conn: Mutex::new(conn),
            last_brain_sync: Mutex::new(None),
        })
    }

    pub fn list_projects(&self) -> Result<Vec<ProjectRecord>> {
        self.sync_sessions_from_brain();
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id, name, path, created_at, last_opened_at FROM projects ORDER BY last_opened_at DESC")?;
        let rows = stmt.query_map([], |row| {
            Ok(ProjectRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                created_at: row.get(3)?,
                last_opened_at: row.get(4)?,
            })
        })?;

        let mut list = Vec::new();
        for r in rows {
            list.push(r?);
        }
        Ok(list)
    }

    pub fn upsert_project(&self, name: &str, path: &str) -> Result<ProjectRecord> {
        let conn = self.conn.lock().unwrap();
        let now = chrono::Utc::now().timestamp_millis();
        let id = uuid::Uuid::new_v4().to_string();

        conn.execute(
            "INSERT INTO projects (id, name, path, created_at, last_opened_at)
             VALUES (?1, ?2, ?3, ?4, ?4)
             ON CONFLICT(path) DO UPDATE SET
             name = excluded.name,
             last_opened_at = excluded.last_opened_at",
            params![id, name, path, now],
        )?;

        let mut stmt = conn.prepare(
            "SELECT id, name, path, created_at, last_opened_at FROM projects WHERE path = ?1",
        )?;
        stmt.query_row(params![path], |row| {
            Ok(ProjectRecord {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                created_at: row.get(3)?,
                last_opened_at: row.get(4)?,
            })
        })
    }

    pub fn remove_project(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM projects WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn sync_sessions_from_brain(&self) {
        if let Ok(mut last_sync) = self.last_brain_sync.lock() {
            if let Some(instant) = *last_sync {
                if instant.elapsed() < std::time::Duration::from_secs(5) {
                    return;
                }
            }
            *last_sync = Some(std::time::Instant::now());
        }

        let brain_dirs = crate::storage::brain_watcher::BrainWatcher::get_brain_dirs();
        let conn = match self.conn.lock() {
            Ok(c) => c,
            Err(_) => return,
        };

        for bdir in brain_dirs {
            if let Ok(entries) = fs::read_dir(bdir) {
                for entry in entries.flatten() {
                    let path = entry.path();
                    if path.is_dir() {
                        let cid = path
                            .file_name()
                            .unwrap_or_default()
                            .to_string_lossy()
                            .to_string();
                        if cid.is_empty() || cid.starts_with('.') {
                            continue;
                        }

                        let full_transcript =
                            path.join(".system_generated/logs/transcript_full.jsonl");
                        let transcript_path = path.join(".system_generated/logs/transcript.jsonl");
                        let tpath = if full_transcript.is_file() {
                            full_transcript
                        } else if transcript_path.is_file() {
                            transcript_path
                        } else {
                            continue;
                        };

                        let exists: bool = conn
                            .query_row(
                                "SELECT 1 FROM sessions WHERE id = ?1",
                                params![&cid],
                                |_| Ok(true),
                            )
                            .unwrap_or(false);

                        if !exists {
                            if let Ok(file) = fs::File::open(&tpath) {
                                use std::io::{BufRead, BufReader};
                                let reader = BufReader::new(file);
                                let mut title = String::from("New Session");
                                let mut project_path = String::new();
                                let mode = String::from("plan");
                                let effort = String::from("high");
                                let mut model: Option<String> = None;
                                let mut created_at = 0i64;

                                for line in reader.lines().take(25).flatten() {
                                    let trimmed = line.trim();
                                    if trimmed.is_empty() {
                                        continue;
                                    }
                                    if let Ok(val) =
                                        serde_json::from_str::<serde_json::Value>(trimmed)
                                    {
                                        let step_type = val.get("type").and_then(|v| v.as_str());

                                        if created_at == 0 {
                                            if let Some(cat) =
                                                val.get("created_at").and_then(|v| v.as_str())
                                            {
                                                if let Ok(dt) =
                                                    chrono::DateTime::parse_from_rfc3339(cat)
                                                {
                                                    created_at = dt.timestamp_millis();
                                                }
                                            }
                                        }

                                        if step_type == Some("USER_INPUT") && title == "New Session"
                                        {
                                            if let Some(content) =
                                                val.get("content").and_then(|v| v.as_str())
                                            {
                                                if let Some(req_start) =
                                                    content.find("<USER_REQUEST>")
                                                {
                                                    let after = &content
                                                        [req_start + "<USER_REQUEST>".len()..];
                                                    if let Some(req_end) =
                                                        after.find("</USER_REQUEST>")
                                                    {
                                                        let clean = after[..req_end].trim();
                                                        if !clean.is_empty() {
                                                            title =
                                                                clean.chars().take(50).collect();
                                                        }
                                                    }
                                                } else if !content.trim().is_empty() {
                                                    title =
                                                        content.trim().chars().take(50).collect();
                                                }

                                                if content
                                                    .contains("`Model Selection` from None to ")
                                                {
                                                    if let Some(pos) = content
                                                        .find("`Model Selection` from None to ")
                                                    {
                                                        let after = &content[pos
                                                            + "`Model Selection` from None to "
                                                                .len()..];
                                                        if let Some(end_pos) = after.find('.') {
                                                            model = Some(
                                                                after[..end_pos].trim().to_string(),
                                                            );
                                                        }
                                                    }
                                                }
                                            }
                                        }

                                        if project_path.is_empty() {
                                            if let Some(tool_calls) =
                                                val.get("tool_calls").and_then(|v| v.as_array())
                                            {
                                                for tc in tool_calls {
                                                    if let Some(args) = tc.get("args") {
                                                        if let Some(p) = args
                                                            .get("Cwd")
                                                            .or_else(|| args.get("SearchDirectory"))
                                                            .or_else(|| args.get("SearchPath"))
                                                            .or_else(|| args.get("DirectoryPath"))
                                                            .and_then(|v| v.as_str())
                                                        {
                                                            let unquoted = p.trim_matches('"');
                                                            if !unquoted.is_empty() {
                                                                project_path = unquoted.to_string();
                                                                break;
                                                            }
                                                        }
                                                    }
                                                }
                                            }
                                        }
                                    }
                                }

                                if created_at == 0 {
                                    created_at = entry
                                        .metadata()
                                        .ok()
                                        .and_then(|m| m.modified().ok())
                                        .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                        .map(|d| d.as_millis() as i64)
                                        .unwrap_or(0);
                                }

                                let updated_at = entry
                                    .metadata()
                                    .ok()
                                    .and_then(|m| m.modified().ok())
                                    .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                                    .map(|d| d.as_millis() as i64)
                                    .unwrap_or(created_at);

                                let _ = conn.execute(
                                    "INSERT OR IGNORE INTO sessions (id, project_path, title, created_at, updated_at, mode, effort, model, agent)
                                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
                                    params![cid, project_path, title, created_at, updated_at, mode, effort, model, Option::<String>::None],
                                );

                                if !project_path.is_empty() {
                                    let path_obj = std::path::Path::new(&project_path);
                                    let proj_name = path_obj
                                        .file_name()
                                        .map(|n| n.to_string_lossy().to_string())
                                        .unwrap_or_else(|| "Project".to_string());
                                    let pid = uuid::Uuid::new_v4().to_string();
                                    let _ = conn.execute(
                                        "INSERT OR IGNORE INTO projects (id, name, path, created_at, last_opened_at)
                                         VALUES (?1, ?2, ?3, ?4, ?5)",
                                        params![pid, proj_name, project_path, created_at, updated_at],
                                    );
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    pub fn list_sessions(&self, project_path: Option<&str>) -> Result<Vec<SessionRecord>> {
        self.sync_sessions_from_brain();

        let conn = self.conn.lock().unwrap();
        let mut list = Vec::new();

        if let Some(path) = project_path {
            let mut stmt = conn.prepare("SELECT id, project_path, title, created_at, updated_at, mode, effort, model, agent FROM sessions WHERE project_path = ?1 ORDER BY updated_at DESC LIMIT 500")?;
            let rows = stmt.query_map(params![path], |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    project_path: row.get(1)?,
                    title: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    mode: row.get(5)?,
                    effort: row.get(6)?,
                    model: row.get(7)?,
                    agent: row.get(8)?,
                    status: None,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        } else {
            let mut stmt = conn.prepare("SELECT id, project_path, title, created_at, updated_at, mode, effort, model, agent FROM sessions ORDER BY updated_at DESC LIMIT 500")?;
            let rows = stmt.query_map([], |row| {
                Ok(SessionRecord {
                    id: row.get(0)?,
                    project_path: row.get(1)?,
                    title: row.get(2)?,
                    created_at: row.get(3)?,
                    updated_at: row.get(4)?,
                    mode: row.get(5)?,
                    effort: row.get(6)?,
                    model: row.get(7)?,
                    agent: row.get(8)?,
                    status: None,
                })
            })?;
            for r in rows {
                list.push(r?);
            }
        }

        drop(conn);

        // Compute live and accurate status for each session
        for item in &mut list {
            item.status = Some(crate::storage::brain_watcher::BrainWatcher::get_session_status(&item.id));
        }

        Ok(list)
    }

    pub fn save_session(&self, record: &SessionRecord) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO sessions (id, project_path, title, created_at, updated_at, mode, effort, model, agent)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(id) DO UPDATE SET
             title = excluded.title,
             updated_at = excluded.updated_at,
             mode = excluded.mode,
             effort = excluded.effort,
             model = excluded.model,
             agent = excluded.agent",
            params![
                record.id,
                record.project_path,
                record.title,
                record.created_at,
                record.updated_at,
                record.mode,
                record.effort,
                record.model,
                record.agent
            ],
        )?;
        Ok(())
    }

    pub fn get_setting(&self, key: &str) -> Result<Option<String>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare("SELECT value FROM settings WHERE key = ?1")?;
        let mut rows = stmt.query(params![key])?;
        if let Some(row) = rows.next()? {
            let val: String = row.get(0)?;
            Ok(Some(val))
        } else {
            Ok(None)
        }
    }

    pub fn set_setting(&self, key: &str, value: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO settings (key, value) VALUES (?1, ?2) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
            params![key, value],
        )?;
        Ok(())
    }

    pub fn list_accounts(&self) -> Result<Vec<AccountRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, email, label, is_active, created_at, last_used_at
             FROM accounts ORDER BY is_active DESC, last_used_at DESC, email COLLATE NOCASE ASC",
        )?;
        let rows = stmt.query_map([], |row| {
            Ok(AccountRecord {
                id: row.get(0)?,
                email: row.get(1)?,
                label: row.get(2)?,
                is_active: row.get(3)?,
                created_at: row.get(4)?,
                last_used_at: row.get(5)?,
            })
        })?;
        rows.collect()
    }

    pub fn get_account(&self, id: &str) -> Result<Option<AccountRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, email, label, is_active, created_at, last_used_at FROM accounts WHERE id = ?1",
        )?;
        let mut rows = stmt.query(params![id])?;
        rows.next()?
            .map(|row| {
                Ok(AccountRecord {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    label: row.get(2)?,
                    is_active: row.get(3)?,
                    created_at: row.get(4)?,
                    last_used_at: row.get(5)?,
                })
            })
            .transpose()
    }

    pub fn get_account_by_email(&self, email: &str) -> Result<Option<AccountRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, email, label, is_active, created_at, last_used_at FROM accounts WHERE email = ?1 COLLATE NOCASE",
        )?;
        let mut rows = stmt.query(params![email])?;
        rows.next()?
            .map(|row| {
                Ok(AccountRecord {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    label: row.get(2)?,
                    is_active: row.get(3)?,
                    created_at: row.get(4)?,
                    last_used_at: row.get(5)?,
                })
            })
            .transpose()
    }

    pub fn get_active_account(&self) -> Result<Option<AccountRecord>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT id, email, label, is_active, created_at, last_used_at FROM accounts WHERE is_active = 1 LIMIT 1",
        )?;
        let mut rows = stmt.query([])?;
        rows.next()?
            .map(|row| {
                Ok(AccountRecord {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    label: row.get(2)?,
                    is_active: row.get(3)?,
                    created_at: row.get(4)?,
                    last_used_at: row.get(5)?,
                })
            })
            .transpose()
    }

    pub fn upsert_imported_active_account(
        &self,
        id: &str,
        email: &str,
        label: &str,
    ) -> Result<AccountRecord> {
        let mut conn = self.conn.lock().unwrap();
        let transaction = conn.transaction()?;
        let now = chrono::Utc::now().timestamp_millis();
        transaction.execute("UPDATE accounts SET is_active = 0", [])?;
        transaction.execute(
            "INSERT INTO accounts (id, email, label, is_active, created_at, last_used_at)
             VALUES (?1, ?2, ?3, 1, ?4, ?4)
             ON CONFLICT(email) DO UPDATE SET
                 label = excluded.label,
                 is_active = 1,
                 last_used_at = excluded.last_used_at",
            params![id, email, label, now],
        )?;
        let account = transaction.query_row(
            "SELECT id, email, label, is_active, created_at, last_used_at FROM accounts WHERE email = ?1 COLLATE NOCASE",
            params![email],
            |row| {
                Ok(AccountRecord {
                    id: row.get(0)?,
                    email: row.get(1)?,
                    label: row.get(2)?,
                    is_active: row.get(3)?,
                    created_at: row.get(4)?,
                    last_used_at: row.get(5)?,
                })
            },
        )?;
        transaction.commit()?;
        Ok(account)
    }

    pub fn set_active_account(&self, id: &str) -> Result<()> {
        let mut conn = self.conn.lock().unwrap();
        let transaction = conn.transaction()?;
        transaction.execute("UPDATE accounts SET is_active = 0", [])?;
        let updated = transaction.execute(
            "UPDATE accounts SET is_active = 1, last_used_at = ?1 WHERE id = ?2",
            params![chrono::Utc::now().timestamp_millis(), id],
        )?;
        if updated != 1 {
            return Err(rusqlite::Error::QueryReturnedNoRows);
        }
        transaction.commit()
    }

    pub fn delete_account(&self, id: &str) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM accounts WHERE id = ?1", params![id])?;
        Ok(())
    }

    pub fn save_switch_journal(&self, journal: &AccountSwitchJournal) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute(
            "INSERT INTO account_switch_journal (singleton, previous_account_id, target_account_id, phase, created_at)
             VALUES (1, ?1, ?2, ?3, ?4)
             ON CONFLICT(singleton) DO UPDATE SET
                 previous_account_id = excluded.previous_account_id,
                 target_account_id = excluded.target_account_id,
                 phase = excluded.phase,
                 created_at = excluded.created_at",
            params![journal.previous_account_id, journal.target_account_id, journal.phase, journal.created_at],
        )?;
        Ok(())
    }

    pub fn get_switch_journal(&self) -> Result<Option<AccountSwitchJournal>> {
        let conn = self.conn.lock().unwrap();
        let mut stmt = conn.prepare(
            "SELECT previous_account_id, target_account_id, phase, created_at FROM account_switch_journal WHERE singleton = 1",
        )?;
        let mut rows = stmt.query([])?;
        rows.next()?
            .map(|row| {
                Ok(AccountSwitchJournal {
                    previous_account_id: row.get(0)?,
                    target_account_id: row.get(1)?,
                    phase: row.get(2)?,
                    created_at: row.get(3)?,
                })
            })
            .transpose()
    }

    pub fn clear_switch_journal(&self) -> Result<()> {
        let conn = self.conn.lock().unwrap();
        conn.execute("DELETE FROM account_switch_journal WHERE singleton = 1", [])?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_db_project_and_session_crud() {
        let temp_dir = std::env::temp_dir().join(format!("gravity_test_{}", uuid::Uuid::new_v4()));
        let db_path = temp_dir.join("test_gravity.db");
        let db = Database::new(db_path).expect("DB init failed");

        // 1. Projects CRUD
        let proj = db
            .upsert_project("Test Project", "/path/to/test")
            .expect("Upsert failed");
        assert_eq!(proj.name, "Test Project");
        assert_eq!(proj.path, "/path/to/test");

        let projects = db.list_projects().expect("List failed");
        assert!(projects
            .iter()
            .any(|p| p.name == "Test Project" && p.path == "/path/to/test"));

        // 2. Sessions CRUD
        let session = SessionRecord {
            id: "sess-123".to_string(),
            project_path: "/path/to/test".to_string(),
            title: "First Session".to_string(),
            created_at: 1000,
            updated_at: 2000,
            mode: "plan".to_string(),
            effort: "high".to_string(),
            model: Some("Gemini 3.7 Flash".to_string()),
            agent: Some("onyx".to_string()),
            status: None,
        };
        db.save_session(&session).expect("Save session failed");

        let sessions = db
            .list_sessions(Some("/path/to/test"))
            .expect("List sessions failed");
        assert_eq!(sessions.len(), 1);
        assert_eq!(sessions[0].id, "sess-123");
        assert_eq!(sessions[0].title, "First Session");
        assert_eq!(sessions[0].agent.as_deref(), Some("onyx"));

        // 3. Settings CRUD
        db.set_setting("theme", "dark").expect("Set setting failed");
        let val = db.get_setting("theme").expect("Get setting failed");
        assert_eq!(val, Some("dark".to_string()));

        // Clean up
        let _ = fs::remove_dir_all(temp_dir);
    }

    #[test]
    fn account_records_keep_one_active_profile_and_a_recovery_journal() {
        let temp_dir =
            std::env::temp_dir().join(format!("gravity_account_test_{}", uuid::Uuid::new_v4()));
        let db = Database::new(temp_dir.join("accounts.db")).expect("DB init failed");

        let first = db
            .upsert_imported_active_account("account-1", "first@example.com", "First")
            .expect("first account should save");
        let second = db
            .upsert_imported_active_account("account-2", "second@example.com", "Second")
            .expect("second account should save");

        assert!(second.is_active);
        assert!(
            !db.get_account(&first.id)
                .expect("first lookup")
                .expect("first exists")
                .is_active
        );

        db.set_active_account(&first.id).expect("activate first");
        assert_eq!(
            db.get_active_account()
                .expect("active lookup")
                .expect("active exists")
                .email,
            "first@example.com"
        );

        db.save_switch_journal(&AccountSwitchJournal {
            previous_account_id: Some(first.id.clone()),
            target_account_id: second.id.clone(),
            phase: "applying".to_string(),
            created_at: 123,
        })
        .expect("save journal");
        assert_eq!(
            db.get_switch_journal()
                .expect("journal lookup")
                .expect("journal exists")
                .target_account_id,
            second.id
        );
        db.clear_switch_journal().expect("clear journal");
        assert!(db.get_switch_journal().expect("journal lookup").is_none());

        let _ = fs::remove_dir_all(temp_dir);
    }
}
