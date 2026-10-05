import { useState, type FormEvent } from 'react'
import { createAccount, signInWithName } from '../hooks/useAuth'
import { isSupabaseConfigured } from '../lib/supabase'

type Mode = 'signin' | 'create'

export function SignIn() {
  const [mode, setMode] = useState<Mode>('signin')
  const [name, setName] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      if (mode === 'signin') await signInWithName(name, password)
      else await createAccount(name, password)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.')
      setBusy(false)
    }
  }

  function switchMode(next: Mode) {
    setMode(next)
    setError(null)
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

            <form className="form auth-form" onSubmit={onSubmit}>
              <div className="field">
                <label htmlFor="auth-name">Name</label>
                <input
                  id="auth-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. rohan"
                  autoComplete="username"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  required
                  autoFocus
                />
              </div>
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
              {error && <div className="form-error auth-error">{error}</div>}
              <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
                {busy
                  ? mode === 'signin'
                    ? 'Signing in…'
                    : 'Creating account…'
                  : mode === 'signin'
                    ? 'Sign in'
                    : 'Create my dictionary'}
              </button>
            </form>
            <p className="auth-note">
              {mode === 'signin'
                ? 'You stay signed in on this device.'
                : 'Each person gets their own private dictionary.'}
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
