import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AvatarFace } from '../components/AvatarFace'
import { ScratchReveal } from '../components/ScratchReveal'
import { acceptShare, dismissShare, refreshShares, useShares } from '../hooks/useShares'
import { findWordByName } from '../hooks/useVocab'
import type { Share } from '../lib/cloud'

function scratchedKey(userId: string | null) {
  return `retain-scratched-shares:${userId ?? 'anon'}`
}

function readScratched(userId: string | null): Set<string> {
  try {
    const raw = localStorage.getItem(scratchedKey(userId))
    const parsed = raw ? (JSON.parse(raw) as unknown) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [])
  } catch {
    return new Set()
  }
}

function rememberScratched(userId: string | null, id: string) {
  try {
    const next = readScratched(userId)
    next.add(id)
    localStorage.setItem(scratchedKey(userId), JSON.stringify([...next].slice(-200)))
  } catch {
    // ignore quota / private mode
  }
}

function ShareCard({
  share,
  from,
  fromAvatar,
  userId,
}: {
  share: Share
  from: string
  fromAvatar?: string
  userId: string | null
}) {
  const [scratched, setScratched] = useState(() => readScratched(userId).has(share.id))
  const [meaningShown, setMeaningShown] = useState(false)
  const alreadyHave = Boolean(findWordByName(share.word))
  const p = share.payload
  const examples = p.examples.filter(Boolean)

  function markScratched() {
    setScratched(true)
    setMeaningShown(false)
    rememberScratched(userId, share.id)
  }

  return (
    <article className="share-card">
      <div className="share-from">
        <AvatarFace avatarId={fromAvatar} name={from} size="sm" />
        <span>
          <strong>{from}</strong> sent you a word
        </span>
      </div>

      {share.note && <p className="share-note">“{share.note}”</p>}

      <ScratchReveal revealed={scratched} onReveal={markScratched} coverPill={`From ${from}`} compact>
        <span className="scratch-kicker">A word from {from}</span>
        {scratched ? (
          <button
            type="button"
            className="share-word"
            onClick={() => setMeaningShown((v) => !v)}
            aria-expanded={meaningShown}
            title={meaningShown ? 'Hide meaning' : 'Tap to reveal the meaning'}
          >
            <span className="mark">{share.word}</span>
          </button>
        ) : (
          <div className="share-word">
            <span className="mark">{share.word}</span>
          </div>
        )}
        {(p.partOfSpeech || p.phonetic) && (
          <p className="muted scratch-meta">{[p.partOfSpeech, p.phonetic].filter(Boolean).join(' · ')}</p>
        )}

        {meaningShown && (
          <div className="meaning-reveal">
            {p.meaning && <div className="word-meaning">{p.meaning}</div>}
            {p.meaningHi && <div className="word-meaning hindi-text">{p.meaningHi}</div>}
            {examples.map((ex, i) => (
              <p key={i} className="sentence">“{ex}”</p>
            ))}
          </div>
        )}
      </ScratchReveal>

      {scratched && (
        <>
          <p className="muted tap-hint">
            {meaningShown ? 'Tap the word again to hide the meaning.' : 'Tap the word to reveal its meaning.'}
          </p>
          <div className="share-actions">
            <button className="btn btn-primary btn-sm" type="button" onClick={() => acceptShare(share)}>
              {alreadyHave ? 'Got it already ✓' : 'Add to my words'}
            </button>
            <button className="btn btn-ghost btn-sm" type="button" onClick={() => dismissShare(share)}>
              Skip
            </button>
          </div>
        </>
      )}
    </article>
  )
}

export function Inbox() {
  const { inbox, friends, loaded, available, userId } = useShares()

  useEffect(() => {
    void refreshShares()
  }, [])

  const friendOf = (id: string) => friends.find((f) => f.userId === id)

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">From your friends</p>
        <h1>Inbox</h1>
        <p>Words your friends think you should know. Scratch one to reveal it.</p>
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
          {inbox.map((share) => {
            const friend = friendOf(share.fromUser)
            return (
              <ShareCard
                key={share.id}
                share={share}
                from={friend?.name ?? 'A friend'}
                fromAvatar={friend?.avatarId}
                userId={userId}
              />
            )
          })}
        </div>
      )}
    </>
  )
}
