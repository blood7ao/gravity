use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserMessagePayload {
    pub content: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct UserEvent {
    pub event: String,
    pub message: UserMessagePayload,
}

impl UserEvent {
    pub fn new(content: &str) -> Self {
        Self {
            event: "user".to_string(),
            message: UserMessagePayload {
                content: content.to_string(),
            },
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitDetails {
    pub cwd: Option<String>,
    pub tools: Option<Vec<String>>,
    pub permission_mode: Option<String>,
    pub model: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InitEvent {
    pub event: String,
    pub conversation_id: Option<String>,
    pub init: Option<InitDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepUpdateDetails {
    pub conversation_id: Option<String>,
    pub step_index: Option<i64>,
    pub state: Option<String>,
    pub step_type: Option<String>,
    pub thinking: Option<String>,
    pub text_delta: Option<String>,
    pub tool_name: Option<String>,
    pub tool_summary: Option<String>,
    pub tool_args: Option<Value>,
    pub duration_seconds: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct StepUpdateEvent {
    pub event: String,
    pub step_update: Option<StepUpdateDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TokenUsage {
    pub input_tokens: Option<i64>,
    pub output_tokens: Option<i64>,
    pub thinking_tokens: Option<i64>,
    pub total_tokens: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultDetails {
    pub conversation_id: Option<String>,
    pub status: Option<String>,
    pub response: Option<String>,
    pub duration_seconds: Option<f64>,
    pub num_turns: Option<i64>,
    pub usage: Option<TokenUsage>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ResultEvent {
    pub event: String,
    pub result: Option<ResultDetails>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct GenericAgyEvent {
    pub event: String,
    #[serde(flatten)]
    pub extra: Value,
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_user_event_serialization() {
        let event = UserEvent::new("build app");
        let json = serde_json::to_string(&event).unwrap();
        assert!(json.contains("\"event\":\"user\""));
        assert!(json.contains("\"content\":\"build app\""));
    }

    #[test]
    fn test_init_event_deserialization() {
        let raw = r#"{"event":"init","conversation_id":"c-123","init":{"cwd":"/tmp","permission_mode":"request-review"}}"#;
        let event: InitEvent = serde_json::from_str(raw).unwrap();
        assert_eq!(event.event, "init");
        assert_eq!(event.conversation_id.unwrap(), "c-123");
        assert_eq!(event.init.unwrap().cwd.unwrap(), "/tmp");
    }

    #[test]
    fn test_step_update_deserialization() {
        let raw = r#"{"event":"step_update","step_update":{"conversation_id":"c-123","step_index":2,"state":"DONE","step_type":"agent_response","text_delta":"hello\n"}}"#;
        let event: StepUpdateEvent = serde_json::from_str(raw).unwrap();
        assert_eq!(event.event, "step_update");
        let details = event.step_update.unwrap();
        assert_eq!(details.text_delta.unwrap(), "hello\n");
        assert_eq!(details.step_type.unwrap(), "agent_response");
    }

    #[test]
    fn test_result_event_deserialization() {
        let raw = r#"{"event":"result","result":{"conversation_id":"c-123","status":"SUCCESS","response":"hello\n","duration_seconds":3.5,"num_turns":1,"usage":{"total_tokens":100}}}"#;
        let event: ResultEvent = serde_json::from_str(raw).unwrap();
        assert_eq!(event.event, "result");
        let res = event.result.unwrap();
        assert_eq!(res.status.unwrap(), "SUCCESS");
        assert_eq!(res.usage.unwrap().total_tokens.unwrap(), 100);
    }
}
