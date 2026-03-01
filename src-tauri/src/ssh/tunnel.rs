use async_trait::async_trait;
use russh::client;
use russh_keys::key;
use std::sync::Arc;
use tokio::net::TcpListener;

pub struct SshClient;

#[async_trait]
impl client::Handler for SshClient {
    type Error = russh::Error;

    async fn check_server_key(
        &mut self,
        _server_public_key: &key::PublicKey,
    ) -> Result<bool, Self::Error> {
        Ok(true)
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
        let ssh_client = SshClient;

        let mut session = client::connect(config, (host, port), ssh_client)
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;

        let auth_result = match auth {
            super::auth::SshAuth::Password(password) => {
                session.authenticate_password(username, password).await
            }
            super::auth::SshAuth::KeyFile { path, passphrase } => {
                let key = super::auth::load_private_key(path, passphrase.as_deref())?;
                session.authenticate_publickey(username, key).await
            }
        };

        match auth_result {
            Ok(true) => {}
            Ok(false) => {
                return Err(crate::error::AppError::Ssh(
                    "Authentication failed".into(),
                ))
            }
            Err(e) => return Err(crate::error::AppError::Ssh(e.to_string())),
        }

        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;
        let local_port = listener.local_addr().unwrap().port();

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

    /// Write binary data to a file on the remote server via SSH exec.
    pub async fn write_file(
        &self,
        remote_path: &str,
        data: &[u8],
    ) -> Result<(), crate::error::AppError> {
        let channel = self
            .session
            .channel_open_session()
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("open session: {}", e)))?;

        // Use cat to write stdin to the file
        let cmd = format!(
            "mkdir -p \"$(dirname '{}')\" && cat > '{}'",
            remote_path, remote_path
        );
        channel
            .exec(true, cmd.as_str())
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("exec: {}", e)))?;

        // Write data to stdin, then close (EOF)
        channel
            .data(&data[..])
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("write data: {}", e)))?;
        channel
            .eof()
            .await
            .map_err(|e| crate::error::AppError::Ssh(format!("eof: {}", e)))?;

        // Wait for the channel to close
        let mut channel_stream = channel.into_stream();
        use tokio::io::AsyncReadExt;
        let mut buf = [0u8; 256];
        loop {
            match channel_stream.read(&mut buf).await {
                Ok(0) => break,
                Ok(_) => {}
                Err(_) => break,
            }
        }

        Ok(())
    }

    /// Forward a local port to a remote host:port through the SSH tunnel.
    /// Returns the locally-bound port number. The forwarding task runs in the
    /// background and terminates when the SSH session is dropped.
    pub async fn forward_local_port(
        &self,
        remote_host: &str,
        remote_port: u16,
    ) -> Result<u16, crate::error::AppError> {
        let listener = TcpListener::bind("127.0.0.1:0")
            .await
            .map_err(|e| crate::error::AppError::Ssh(e.to_string()))?;
        let local_port = listener.local_addr().unwrap().port();
        let session = self.session.clone();
        let rhost = remote_host.to_string();

        tokio::spawn(async move {
            loop {
                match listener.accept().await {
                    Ok((mut local_stream, _)) => {
                        let sess = session.clone();
                        let rh = rhost.clone();
                        tokio::spawn(async move {
                            match sess
                                .channel_open_direct_tcpip(
                                    &rh,
                                    remote_port as u32,
                                    "127.0.0.1",
                                    local_port as u32,
                                )
                                .await
                            {
                                Ok(channel) => {
                                    let mut ssh_stream = channel.into_stream();
                                    let _ = tokio::io::copy_bidirectional(
                                        &mut local_stream,
                                        &mut ssh_stream,
                                    )
                                    .await;
                                }
                                Err(e) => {
                                    log::debug!("Port forward channel error: {}", e);
                                }
                            }
                        });
                    }
                    Err(_) => break,
                }
            }
        });

        Ok(local_port)
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
