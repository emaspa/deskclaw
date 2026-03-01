use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
pub enum AppError {
    Ssh(String),
    SshKey(String),
    Gateway(String),
    State(String),
    Io(String),
    Settings(String),
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Ssh(s) => write!(f, "SSH error: {}", s),
            Self::SshKey(s) => write!(f, "SSH key error: {}", s),
            Self::Gateway(s) => write!(f, "Gateway error: {}", s),
            Self::State(s) => write!(f, "State error: {}", s),
            Self::Io(s) => write!(f, "IO error: {}", s),
            Self::Settings(s) => write!(f, "Settings error: {}", s),
        }
    }
}

impl From<AppError> for String {
    fn from(e: AppError) -> Self {
        e.to_string()
    }
}
