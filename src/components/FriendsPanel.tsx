import { useEffect, useState, type FormEvent } from 'react'
import {
  answerFriendInvite,
  inviteFriendByEmail,
  refreshShares,
  useShares,
} from '../hooks/useShares'
import { isCompleteEmail, lookupUserByEmail, type EmailMatch } from '../lib/cloud'
import { AvatarFace } from './AvatarFace'

type Props = {
  onClose: () => void
}

export function FriendsPanel({ onClose }: Props) {
  const { friends, requests, loaded, available } = useShares()
  const [email, setEmail] = useState('')
  const [match, setMatch] = useState<EmailMatch | null>(null)
  const [lookup, setLookup] = useState<'idle' | 'miss'>('idle')
  const [busy, setBusy] = useState(false)
  const [actingId, setActingId] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const incoming = requests.filter((r) => r.direction === 'incoming')
  const outgoing = requests.filter((r) => r.direction === 'outgoing')

  useEffect(() => {
    void refreshShares()
  }, [])

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [onClose])

  useEffect(() => {
    const value = email.trim().toLowerCase()
    setMatch(null)
    if (!isCompleteEmail(value)) {
      setLookup('idle')
      return
    }
    let cancel = false
    const timer = window.setTimeout(() => {
      void lookupUserByEmail(value)
        .then((found) => {
          if (cancel) return
          if (found && found.email === value) {
            setMatch(found)
            setLookup('idle')
          } else {
            setMatch(null)
            setLookup('miss')
          }
        })
        .catch(() => {
          if (!cancel) {
            setMatch(null)
            setLookup('idle')
          }
        })
    }, 250)
    return () => {
      cancel = true
      window.clearTimeout(timer)
    }
  }, [email])

  async function sendInvite(raw?: string) {
    if (busy) return
    const value = (raw ?? email).trim().toLowerCase()
    if (!isCompleteEmail(value)) {
      setError('Type the whole sign-in email. A match appears only when the address is exact.')
      setMatch(null)
      return
    }
    setBusy(true)
    setError(null)
    setMessage(null)
    try {
      const found = await lookupUserByEmail(value)
      if (!found || found.email !== value) {
        setMatch(null)
        setError('No Retain account uses that exact email.')
        return
      }
      setMatch(found)
      const result = await inviteFriendByEmail(found.email)
      if (!result.ok) {
        setError(result.error || 'Could not send invite.')
        return
      }
      if (result.status === 'accepted') {
        setMessage(`You’re already collabing with ${result.name}.`)
      } else if (result.already && result.incoming) {
        setMessage(`${result.name} already invited you — accept below.`)
      } else if (result.already) {
        setMessage(`Invite to ${result.name} is already waiting.`)
      } else {
        setMessage(`Invite sent to ${result.name}. They’ll see it in Friends.`)
      }
      setEmail('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send invite.')
    } finally {
      setBusy(false)
    }
  }

  async function respond(id: string, accept: boolean) {
    setActingId(id)
    setError(null)
    try {
      const result = await answerFriendInvite(id, accept)
      if (!result.ok) {
        setError(result.error || 'Could not update invite.')
        return
      }
      setMessage(accept ? 'You’re friends now — share words anytime.' : 'Invite declined.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update invite.')
    } finally {
      setActingId(null)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal friends-panel"
        role="dialog"
        aria-modal="true"
        aria-label="Friends"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <p className="eyebrow">Collaborate</p>
        <h2 className="share-title">Friends</h2>
        <p className="friends-lead">
          Invite someone with the exact email they use to sign in. Type the whole address. When it
          matches one account, that email shows up so you can send the invite. After they accept, you
          can send words to each other.
        </p>

        {!available ? (
          <p className="muted">Sharing isn’t set up on this project yet.</p>
        ) : !loaded ? (
          <div className="lookup-status">
            <span className="spinner" /> Loading friends…
          </div>
        ) : (
          <>
            <form
              className="friends-invite"
              onSubmit={(e: FormEvent) => {
                e.preventDefault()
                void sendInvite()
              }}
            >
              <label htmlFor="friend-email">Their sign-in email</label>
              <div className="friends-invite-row">
                <input
                  id="friend-email"
                  type="email"
                  inputMode="email"
                  autoComplete="off"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck={false}
                  placeholder="name@email.com"
                  aria-autocomplete="list"
                  aria-controls="friend-email-match"
                  aria-expanded={Boolean(match)}
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value)
                    setError(null)
                  }}
                />
                <button className="btn btn-primary btn-sm" type="submit" disabled={busy || !match}>
                  {busy ? 'Sending…' : 'Invite'}
                </button>
              </div>
              {match && (
                <ul className="friends-lookup-list" id="friend-email-match" role="listbox">
                  <li>
                    <button
                      type="button"
                      role="option"
                      aria-selected="true"
                      onClick={() => void sendInvite(match.email)}
                    >
                      {match.email}
                    </button>
                  </li>
                </ul>
              )}
              {!match && lookup === 'miss' && !error && (
                <p className="friends-lookup-empty">No Retain account uses that exact email.</p>
              )}
            </form>

            {error && <div className="form-error">{error}</div>}
            {message && (
              <p className="friends-msg" role="status">
                {message}
              </p>
            )}

            {incoming.length > 0 && (
              <section className="friends-section">
                <h3>Incoming invites</h3>
                <ul className="friends-list">
                  {incoming.map((r) => (
                    <li key={r.id} className="friends-row">
                      <AvatarFace avatarId={r.otherAvatar} name={r.otherName} size="sm" />
                      <div className="friends-row-copy">
                        <strong>{r.otherName}</strong>
                        <small>wants to collab</small>
                      </div>
                      <div className="friends-row-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={actingId === r.id}
                          onClick={() => void respond(r.id, true)}
                        >
                          Accept
                        </button>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          disabled={actingId === r.id}
                          onClick={() => void respond(r.id, false)}
                        >
                          Decline
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {outgoing.length > 0 && (
              <section className="friends-section">
                <h3>Waiting on</h3>
                <ul className="friends-list">
                  {outgoing.map((r) => (
                    <li key={r.id} className="friends-row">
                      <AvatarFace avatarId={r.otherAvatar} name={r.otherName} size="sm" />
                      <div className="friends-row-copy">
                        <strong>{r.otherName}</strong>
                        <small>invite pending</small>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            <section className="friends-section">
              <h3>Your friends</h3>
              {friends.length === 0 ? (
                <p className="muted">No collab partners yet. Invite someone above.</p>
              ) : (
                <ul className="friends-list">
                  {friends.map((f) => (
                    <li key={f.userId} className="friends-row">
                      <AvatarFace avatarId={f.avatarId} name={f.name} size="sm" />
                      <div className="friends-row-copy">
                        <strong>{f.name}</strong>
                        <small>can share words</small>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  )
}
