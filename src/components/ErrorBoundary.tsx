import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[deskclaw] React error:', error, info.componentStack);
  }

  render() {
    if (this.state.error) {
      return (
        <div
          style={{
            padding: '24px',
            color: '#ff5252',
            background: '#1a1a2e',
            height: '100vh',
            fontFamily: 'monospace',
            fontSize: '14px',
            overflow: 'auto',
          }}
        >
          <h2 style={{ marginBottom: '12px' }}>Something went wrong</h2>
          <pre style={{ whiteSpace: 'pre-wrap', color: '#ff8a80' }}>
            {this.state.error.message}
          </pre>
          <pre style={{ whiteSpace: 'pre-wrap', color: 'rgba(255,255,255,0.5)', marginTop: '12px', fontSize: '12px' }}>
            {this.state.error.stack}
          </pre>
          <button
            onClick={() => this.setState({ error: null })}
            style={{
              marginTop: '16px',
              padding: '8px 16px',
              background: '#6c5ce7',
              color: '#fff',
              border: 'none',
              borderRadius: '8px',
              cursor: 'pointer',
            }}
          >
            Try Again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
