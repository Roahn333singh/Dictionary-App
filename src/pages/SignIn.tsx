import { useState, type FormEvent } from 'react'
import { createAccount, requestPasswordReset, signIn } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

type Mode = 'signin' | 'create' | 'forgot'

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [username, setUsername] = useState('')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      if (mode === 'signin') await signIn(identifier, password)
      else if (mode === 'create') await createAccount(email, username, password)
      else setNotice(await requestPasswordReset(identifier))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
    } finally {
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setPassword('')
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Retain</span>
        </div>
        <h1 className="hero-title auth-title">
          Words you meet. <span className="highlight">Words you keep.</span>
        </h1>

        {isSupabaseConfigured ? (
          <>
            {mode !== 'forgot' && (
              <div className="filter-pills auth-tabs" role="tablist">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'signin'}
                  className={mode === 'signin' ? 'active' : ''}
                  onClick={() => switchMode('signin')}
                >
                  Sign in
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'create'}
                  className={mode === 'create' ? 'active' : ''}
                  onClick={() => switchMode('create')}
                >
                  New account
                </button>
              </div>
            )}

            <form className="form auth-form" onSubmit={onSubmit}>
              {mode === 'create' ? (
                <>
                  <div className="field">
                    <label htmlFor="auth-email">Email</label>
                    <input
                      id="auth-email"
                      type="email"
                      inputMode="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@email.com"
                      autoComplete="email"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="auth-username">Username</label>
                    <input
                      id="auth-username"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="e.g. rohan"
                      autoComplete="username"
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                      minLength={2}
                      maxLength={24}
                      required
                    />
                    <p className="auth-hint">Letters and numbers. This stays your name in Retain, separate from your email.</p>
                  </div>
                </>
              ) : (
                <div className="field">
                  <label htmlFor="auth-identifier">Email or username</label>
                  <input
                    id="auth-identifier"
                    value={identifier}
                    onChange={(e) => setIdentifier(e.target.value)}
                    placeholder="you@email.com or rohan"
                    autoComplete="username"
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    required
                    autoFocus
                  />
                </div>
              )}

              {mode !== 'forgot' && (
                <div className="field">
                  <label htmlFor="auth-password">Password</label>
                  <input
                    id="auth-password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="At least 6 characters"
                    autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                    minLength={6}
                    required
                  />
                </div>
              )}

              {error && <div className="form-error auth-error">{error}</div>}
              {notice && (
                <p className="friends-msg" role="status">
                  {notice}
                </p>
              )}
              <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                {busy
                  ? mode === 'signin'
                    ? 'Signing in…'
                    : mode === 'create'
                      ? 'Creating account…'
                      : 'Sending…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : mode === 'create'
                      ? 'Create my dictionary'
                      : 'Email me a reset link'}
              </button>
            </form>

            <div className="auth-links">
              {mode === 'forgot' ? (
                <button type="button" className="auth-text-btn" onClick={() => switchMode('signin')}>
                  Back to sign in
                </button>
              ) : (
                mode === 'signin' && (
                  <button type="button" className="auth-text-btn" onClick={() => switchMode('forgot')}>
                    Forgot password?
                  </button>
                )
              )}
            </div>

            <p className="auth-note">
              {mode === 'signin'
                ? 'Sign in with your email or your username. You stay signed in on this device.'
                : mode === 'create'
                  ? 'You’ll be signed in as soon as the account is created. Each person gets their own private dictionary.'
                  : 'The reset link goes to the real email on the account, then opens a page here to choose a new password.'}
            </p>
          </>
        ) : (
          <p className="auth-sub">
            Setup needed: add <code>VITE_SUPABASE_URL</code> and{' '}
            <code>VITE_SUPABASE_ANON_KEY</code> to <code>.env.local</code>, then rebuild.
          </p>
        )}
      </div>
    </div>
  )
}
