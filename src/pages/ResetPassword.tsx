import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { updatePassword } from '../hooks/useAuth'
import { supabase } from '../lib/supabase'

type Phase = 'checking' | 'ready' | 'invalid' | 'done'

function recoveryHint() {
  const params = new URLSearchParams(window.location.search)
  const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''))
  return (
    params.has('code') ||
    params.has('token_hash') ||
    params.get('type') === 'recovery' ||
    hash.has('access_token') ||
    hash.get('type') === 'recovery'
  )
}

export function ResetPassword() {
  const navigate = useNavigate()
  const [phase, setPhase] = useState<Phase>('checking')
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!supabase) {
      setPhase('invalid')
      return
    }
    const client = supabase
    const hinted = recoveryHint()
    let settled = false
    const params = new URLSearchParams(window.location.search)
    const tokenHash = params.get('token_hash')
    const type = params.get('type')

    function ready() {
      if (settled) return
      settled = true
      setPhase('ready')
    }
    function invalid() {
      if (settled) return
      settled = true
      setPhase('invalid')
    }

    const { data: sub } = client.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (Boolean(session) && hinted && (event === 'SIGNED_IN' || event === 'INITIAL_SESSION'))) {
        ready()
      }
    })

    async function start() {
      if (tokenHash && (type === 'recovery' || type === null)) {
        const { error: verifyError } = await client.auth.verifyOtp({
          token_hash: tokenHash,
          type: 'recovery',
        })
        if (verifyError) invalid()
        else ready()
        return
      }
      if (!hinted) {
        invalid()
        return
      }
      const { data } = await client.auth.getSession()
      if (data.session) ready()
    }

    void start()
    const timer = window.setTimeout(() => {
      if (!settled) invalid()
    }, 8000)

    return () => {
      settled = true
      window.clearTimeout(timer)
      sub.subscription.unsubscribe()
    }
  }, [])

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    if (busy) return
    setError(null)
    if (password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    if (password !== confirm) {
      setError('Those passwords don’t match.')
      return
    }
    setBusy(true)
    try {
      await updatePassword(password)
      setPhase('done')
      window.setTimeout(() => navigate('/', { replace: true }), 600)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update the password.')
      setBusy(false)
    }
  }

  return (
    <div className="auth-screen">
      <div className="auth-card">
        <div className="brand auth-brand">
          <span className="brand-mark">R</span>
          <span className="brand-name">Retain</span>
        </div>
        <h1 className="hero-title auth-title">Choose a new password</h1>

        {phase === 'checking' && (
          <div className="lookup-status" aria-live="polite">
            <span className="spinner" />
            Opening your reset link…
          </div>
        )}

        {phase === 'invalid' && (
          <>
            <p className="auth-sub">
              This reset link is invalid or has expired. Request a new one from the sign-in screen.
            </p>
            <Link className="btn btn-primary auth-submit" to="/">
              Back to sign in
            </Link>
          </>
        )}

        {phase === 'ready' && (
          <form className="form auth-form" onSubmit={onSubmit}>
            <div className="field">
              <label htmlFor="reset-password">New password</label>
              <input
                id="reset-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="new-password"
                minLength={6}
                required
                autoFocus
              />
            </div>
            <div className="field">
              <label htmlFor="reset-confirm">Confirm password</label>
              <input
                id="reset-confirm"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Type it again"
                autoComplete="new-password"
                minLength={6}
                required
              />
            </div>
            {error && <div className="form-error auth-error">{error}</div>}
            <button type="submit" className="btn btn-primary auth-submit" disabled={busy}>
              {busy ? 'Saving…' : 'Save password'}
            </button>
          </form>
        )}

        {phase === 'done' && <p className="auth-note">Password saved. Taking you into Retain…</p>}
      </div>
    </div>
  )
}
