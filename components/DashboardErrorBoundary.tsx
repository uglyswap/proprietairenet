'use client';

import { Component, ReactNode } from 'react';

interface Props { children: ReactNode; }
interface State { hasError: boolean; error: Error | null; errorInfo: any; }

export default class DashboardErrorBoundary extends Component<Props, State> {
  constructor(props: Props) { super(props); this.state = { hasError: false, error: null, errorInfo: null }; }
  static getDerivedStateFromError(error: Error) { return { hasError: true, error }; }
  componentDidCatch(error: Error, errorInfo: any) { this.setState({ errorInfo }); console.error('Dashboard Error:', error, errorInfo); }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: '40px', fontFamily: 'monospace', maxWidth: '800px', margin: '0 auto' }}>
          <h1 style={{ color: 'red' }}>Dashboard Error</h1>
          <h2>{this.state.error?.message}</h2>
          <pre style={{ background: '#f5f5f5', padding: '16px', overflow: 'auto', fontSize: '12px', maxHeight: '400px' }}>{this.state.error?.stack}</pre>
          <pre style={{ background: '#fff3cd', padding: '16px', overflow: 'auto', fontSize: '12px', maxHeight: '300px' }}>{this.state.errorInfo?.componentStack}</pre>
          <button onClick={() => window.location.reload()} style={{ marginTop: '16px', padding: '8px 16px' }}>Recharger</button>
        </div>
      );
    }
    return this.props.children;
  }
}
