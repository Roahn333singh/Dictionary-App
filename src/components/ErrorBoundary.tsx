import { Component, type ErrorInfo, type ReactNode } from 'react'

type Props = { children: ReactNode }
type State = { error: Error | null }

/** Last line of defence: a render crash shows a recovery screen instead of a blank page. Saved words are never touched. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Retain crashed', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="auth-screen">
        <div className="auth-card crash-card">
          <div className="empty-emoji" aria-hidden>🫠</div>
          <h1 className="auth-title">Oops, that glitched.</h1>
          <p className="auth-sub">
            Your words are safe — they’re saved on this device and in your account. Reload to keep going.
          </p>
          <button className="btn btn-primary auth-submit" type="button" onClick={() => window.location.assign('/')}>
            Reload Retain
          </button>
        </div>
      </div>
    )
  }
}
