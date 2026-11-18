import { Component, type ReactNode } from 'react';

interface State {
  error: Error | null;
}

/** Last line of defence: never show a blank page. */
export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };
  static getDerivedStateFromError(error: Error): State {
    return { error };
  }
  override componentDidCatch(error: Error) {
    console.error('SDF Forge crashed:', error);
  }
  override render() {
    if (!this.state.error) return this.props.children;
    const reset = () => {
      try {
        const doc = localStorage.getItem('sdf-forge:doc');
        if (doc) localStorage.setItem('sdf-forge:doc-backup', doc);
        localStorage.removeItem('sdf-forge:doc');
      } catch {
        /* ignore */
      }
      location.hash = '';
      location.reload();
    };
    return (
      <div role="alert" style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24 }}>
        <div className="empty-card" style={{ maxWidth: 440 }}>
          <h2>Something went wrong</h2>
          <p>
            SDF Forge hit an unexpected error: <code>{this.state.error.message}</code>
          </p>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
            <button type="button" className="btn" onClick={() => location.reload()}>
              Reload
            </button>
            <button type="button" className="btn primary" onClick={reset}>
              Start fresh (keeps a backup)
            </button>
          </div>
        </div>
      </div>
    );
  }
}
