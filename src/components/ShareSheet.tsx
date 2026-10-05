import { useEffect, useState } from 'react'
import { refreshShares, shareWord, useShares } from '../hooks/useShares'
import type { VocabWord } from '../types'
import { ShareIcon } from './Icons'

type Props = {
  word: VocabWord
  onClose: () => void
}

export function ShareSheet({ word, onClose }: Props) {
  const { friends, loaded, available } = useShares()
  const [selected, setSelected] = useState<string[]>([])
  const [note, setNote] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<string | null>(null)

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

  function toggle(id: string) {
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]))
    setError(null)
  }

  async function send() {
    if (sending) return
    if (selected.length === 0) {
      setError('Pick at least one friend.')
      return
    }
    setSending(true)
    setError(null)
    try {
      const results = await shareWord(word, selected, note)
      const nameOf = (id: string) => friends.find((f) => f.userId === id)?.name ?? 'friend'
      const failed = results.filter((r) => !r.ok)
      const already = results.filter((r) => r.ok && r.alreadyShared)
      if (failed.length === results.length) {
        setError(navigator.onLine ? 'Couldn’t send right now. Try again in a moment.' : 'You’re offline. Connect and try again.')
        return
      }
      const sentTo = results.filter((r) => r.ok && !r.alreadyShared).map((r) => nameOf(r.userId))
      const parts: string[] = []
      if (sentTo.length) parts.push(`Sent to ${sentTo.join(', ')}`)
      if (already.length) parts.push(`${already.map((r) => nameOf(r.userId)).join(', ')} already ha${already.length === 1 ? 's' : 've'} it waiting`)
      if (failed.length) parts.push(`couldn’t reach ${failed.map((r) => nameOf(r.userId)).join(', ')}`)
      setDone(parts.join(' · '))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Couldn’t send right now.')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal share-sheet" role="dialog" aria-modal="true" aria-label={`Share ${word.word}`} onClick={(e) => e.stopPropagation()}>
        <div className="sheet-handle" aria-hidden />
        <p className="eyebrow">Share a word</p>
        <h2 className="share-title">{word.word}</h2>

        {done ? (
          <>
            <div className="share-done" role="status">
              <span className="share-done-emoji" aria-hidden>🚀</span>
              {done}
            </div>
            <div className="modal-actions">
              <button className="btn btn-primary" type="button" onClick={onClose}>
                Nice
              </button>
            </div>
          </>
        ) : !available ? (
          <p className="muted">Sharing isn’t set up yet. Run <code>supabase/sharing.sql</code> in Supabase first.</p>
        ) : !loaded ? (
          <div className="lookup-status">
            <span className="spinner" /> Loading friends…
          </div>
        ) : friends.length === 0 ? (
          <>
            <p className="muted">No friends here yet. Send them the app link and ask them to create an account — then they’ll show up here.</p>
            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose}>
                Close
              </button>
            </div>
          </>
        ) : (
          <>
            <div className="friend-chips" role="group" aria-label="Choose friends">
              {friends.map((f) => {
                const on = selected.includes(f.userId)
                return (
                  <button
                    key={f.userId}
                    type="button"
                    className={`friend-chip${on ? ' selected' : ''}`}
                    aria-pressed={on}
                    onClick={() => toggle(f.userId)}
                  >
                    <span className="friend-avatar" aria-hidden>
                      {f.name.charAt(0).toUpperCase()}
                    </span>
                    {f.name}
                  </button>
                )
              })}
            </div>

            <div className="field">
              <label htmlFor="share-note">Note (optional)</label>
              <input
                id="share-note"
                value={note}
                maxLength={200}
                onChange={(e) => setNote(e.target.value)}
                placeholder="heard this in a podcast, so good"
              />
            </div>

            {error && <div className="form-error">{error}</div>}

            <div className="modal-actions">
              <button className="btn btn-ghost" type="button" onClick={onClose}>
                Cancel
              </button>
              <button className="btn btn-primary" type="button" onClick={send} disabled={sending}>
                <ShareIcon size={18} />
                {sending ? 'Sending…' : selected.length > 1 ? `Send to ${selected.length}` : 'Send'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
