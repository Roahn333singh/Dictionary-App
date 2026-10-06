import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { acceptShare, dismissShare, refreshShares, useShares } from '../hooks/useShares'
import { findWordByName } from '../hooks/useVocab'
import type { Share } from '../lib/cloud'

function ShareCard({ share, from }: { share: Share; from: string }) {
  const [revealed, setRevealed] = useState(false)
  const alreadyHave = Boolean(findWordByName(share.word))
  const p = share.payload
  const examples = p.examples.filter(Boolean)

  return (
    <article className="share-card">
      <div className="share-from">
        <span className="friend-avatar" aria-hidden>
          {from.charAt(0).toUpperCase()}
        </span>
        <span>
          <strong>{from}</strong> sent you
        </span>
      </div>

      <button
        type="button"
        className="share-word"
        onClick={() => setRevealed((v) => !v)}
        aria-expanded={revealed}
        title={revealed ? 'Hide meaning' : 'Reveal meaning'}
      >
        <span className="mark">{share.word}</span>
      </button>

      {share.note && <p className="share-note">“{share.note}”</p>}

      {revealed && (
        <div className="meaning-reveal">
          {p.meaning && <div className="word-meaning">{p.meaning}</div>}
          {p.meaningHi && <div className="word-meaning hindi-text">{p.meaningHi}</div>}
          {examples.map((ex, i) => (
            <p key={i} className="sentence">“{ex}”</p>
          ))}
        </div>
      )}

      <div className="share-actions">
        <button className="btn btn-primary btn-sm" type="button" onClick={() => acceptShare(share)}>
          {alreadyHave ? 'Got it already ✓' : 'Add to my words'}
        </button>
        <button className="btn btn-ghost btn-sm" type="button" onClick={() => dismissShare(share)}>
          Skip
        </button>
      </div>
    </article>
  )
}

export function Inbox() {
  const { inbox, friends, loaded, available } = useShares()

  useEffect(() => {
    void refreshShares()
  }, [])

  const nameOf = (id: string) => friends.find((f) => f.userId === id)?.name ?? 'A friend'

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">From your friends</p>
        <h1>Inbox</h1>
        <p>Words your friends think you should know. Tap one to peek.</p>
      </div>

      {!available ? (
        <div className="empty">
          <h3>Sharing isn’t set up yet</h3>
          <p>Run <code>supabase/sharing.sql</code> once in the Supabase SQL Editor.</p>
        </div>
      ) : !loaded ? (
        <div className="lookup-status">
          <span className="spinner" /> Checking for new words…
        </div>
      ) : inbox.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji" aria-hidden>📭</div>
          <h3>All caught up</h3>
          <p>When a friend shares a word with you, it lands here. You can share too — open any word in your library and hit Share.</p>
          <Link className="btn btn-primary" to="/library">
            Go to my words
          </Link>
        </div>
      ) : (
        <div className="inbox-list">
          {inbox.map((share) => (
            <ShareCard key={share.id} share={share} from={nameOf(share.fromUser)} />
          ))}
        </div>
      )}
    </>
  )
}
