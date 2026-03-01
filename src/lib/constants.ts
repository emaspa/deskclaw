export const DEFAULT_SSH_PORT = 22;
export const DEFAULT_GATEWAY_PORT = 18789;

export const CONNECTION_LABELS: Record<string, string> = {
  Disconnected: 'Disconnected',
  ConnectingSsh: 'Connecting via SSH...',
  SshConnected: 'SSH connected',
  ConnectingGateway: 'Connecting to Gateway...',
  Handshaking: 'Authenticating...',
  Connected: 'Connected',
};
