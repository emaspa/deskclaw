use russh::client;
use russh::keys::{PrivateKeyWithHashAlg, PublicKey};
use std::sync::Arc;
use tokio::net::TcpListener;

pub struct SshClient {
    /// Optional expected server public key for verification.
    /// If None, all keys are accepted (first-connect / TOFU).
    /// If Some, the server key must match exactly.
    expected_server_key: Option<PublicKey>,
}

impl SshClient {
    pub fn new(expected_key: Option<PublicKey>) -> Self {
        Self {
            expected_server_key: expected_key,
        }
    }
}

impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        server_public_key: &PublicKey,
    ) -> Result<bool, Self::Error> {
        match &self.expected_server_key {
            Some(expected) => {
                let matches = server_public_key == expected;
                if !matches {
                    log::warn!(
                        "SSH server key mismatch! Expected {}, got {}",
                        expected.algorithm(),
                        server_public_key.algorithm()
                    );
                }
                Ok(matches)
            }
            None => {
                // TOFU (Trust On First Use): accept and log the key
                log::info!(
                    "Accepting SSH server key (TOFU): type={}",
                    server_public_key.algorithm()
                );
                Ok(true)
            }
        }
    }
}

pub struct SshTunnel {
    session: Arc<client::Handle<SshClient>>,
    local_port: u16,
    _shutdown_tx: tokio::sync::oneshot::Sender<()>,
}

impl std::fmt::Debug for SshTunnel {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.debug_struct("SshTunnel")
            .field("local_port", &self.local_port)
            .finish()
    }
}

impl SshTunnel {
    pub async fn connect(
        host: &str,
        port: u16,
        username: &str,
        auth: &super::auth::SshAuth,
        remote_port: u16,
    ) -> Result<Self, crate::error::AppError> {
        let config = Arc::new(client::Config::default());
        let ssh_client = SshClient::new(None);

        let mut session = client::connect(config, (host, port), ssh_client)
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;

        let auth_result = match auth {
            super::auth::SshAuth::Password(password) => {
                session.authenticate_password(username, password).await
            }
            super::auth::SshAuth::KeyFile { path, passphrase } => {
                let key = super::auth::load_private_key(path, passphrase.as_deref())?;
                // RSA keys need the strongest hash the server supports (SHA-2
                // extensions); other key types ignore the hint.
                let best_hash = session
                    .best_supported_rsa_hash()
                    .await
                    .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?
                    .flatten();
                session
                    .authenticate_publickey(username, PrivateKeyWithHashAlg::new(key, best_hash))
                    .await
            }
        };

        match auth_result {
            Ok(result) if result.success() => {}
            Ok(_) => {
                return Err(crate::error::AppError::Ssh(
                    "Authentication failed".into(),
                ))
            }
            Err(e) => return Err(crate::error::AppError::Ssh(e.to_string())),
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;
        let local_port = listener
            .local_addr()
            .map_err(|e| crate::error::AppError::Ssh(format!("local_addr: {}", e)))?
            .port();

        let (shutdown_tx, mut shutdown_rx) = tokio::sync::oneshot::channel::<()>();
        let session = Arc::new(session);
        let session_clone = session.clone();

        tokio::spawn(async move {
            loop {
                tokio::select! {
                    accept_result = listener.accept() => {
                        match accept_result {
                            Ok((mut local_stream, _)) => {
                                let session_inner = session_clone.clone();
                                tokio::spawn(async move {
                                    match session_inner.channel_open_direct_tcpip(
                                        "127.0.0.1",
                                        remote_port as u32,
                                        "127.0.0.1",
                                        local_port as u32,
                                    ).await {
                                        Ok(channel) => {
                                            let mut ssh_stream = channel.into_stream();
                                            let _ = tokio::io::copy_bidirectional(
                                                &mut local_stream,
                                                &mut ssh_stream,
                                            ).await;
                                        }
                                        Err(e) => {
                                            log::error!("Tunnel channel error: {}", e);
                                        }
                                    }
                                });
                            }
                            Err(e) => {
                                log::error!("Listener accept error: {}", e);
                                break;
                            }
                        }
                    }
                    _ = &mut shutdown_rx => {
                        break;
                    }
                }
            }
        });

        Ok(Self {
            session,
            local_port,
            _shutdown_tx: shutdown_tx,
        })
    }

    pub fn local_port(&self) -> u16 {
        self.local_port
    }

    /// Execute a command on the remote server via SSH and return stdout.
    pub async fn exec(&self, command: &str) -> Result<String, crate::error::AppError> {
        let channel = self
            .session
            .channel_open_session()
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("open session: {}", e)))?;

        channel
            .exec(true, command)
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("exec: {}", e)))?;

        let mut stdout = Vec::new();
        let mut channel_stream = channel.into_stream();
        use tokio::io::AsyncReadExt;
        let mut buf = [0u8; 4096];
        loop {
            match channel_stream.read(&mut buf).await {
                Ok(0) => break,
                Ok(n) => stdout.extend_from_slice(&buf[..n]),
                Err(e) => {
                    return Err(crate::error::AppError::Ssh(format!("read: {}", e)));
                }
            }
        }

        String::from_utf8(stdout)
            .map(|s| s.trim().to_string())
            .map_err(|e| crate::error::AppError::Ssh(format!("utf8: {}", e)))
    }

    pub async fn disconnect(self) -> Result<(), crate::error::AppError> {
        drop(self._shutdown_tx);
        self.session
            .disconnect(russh::Disconnect::ByApplication, "User disconnected", "en")
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;
        Ok(())
    }
}

/// Safely escape a string for use in a POSIX shell command.
/// Wraps in single quotes and escapes embedded single quotes.
pub fn shell_escape(s: &str) -> String {
    format!("'{}'", s.replace('\'', "'\\''"))
}
