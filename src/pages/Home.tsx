import { Link } from 'react-router-dom'
import { WordCard } from '../components/WordCard'
import { WordOfTheDay } from '../components/WordOfTheDay'
import { useAuth } from '../hooks/useAuth'
import { useShares } from '../hooks/useShares'
import { useVocab } from '../hooks/useVocab'

function greeting() {
  const h = new Date().getHours()
  if (h < 5) return 'Up late'
  if (h < 12) return 'Morning'
  if (h < 17) return 'Hey'
  return 'Evening'
}

export function Home() {
  const { words, dueWords, stats } = useVocab()
  const { inbox, friends, available } = useShares()
  const { session } = useAuth()
  const recent = words.slice(0, 5)
  const meta = (session?.user.user_metadata ?? {}) as { display_name?: string }
  const name = meta.display_name || session?.user.email?.split('@')[0] || ''

  const senders = [...new Set(inbox.map((s) => friends.find((f) => f.userId === s.fromUser)?.name ?? 'A friend'))]

  return (
    <>
      <section className="hero">
        <p className="eyebrow">
          {greeting()}
          {name ? `, ${name}` : ''} 👋
        </p>
        <h1 className="hero-title">
          Words you meet. <span className="highlight">Words you keep.</span>
        </h1>
        <div className="hero-stickers">
          {stats.streak > 0 && <span className="sticker sticker-fire">🔥 {stats.streak}-day streak</span>}
          {dueWords.length > 0 && <span className="sticker sticker-due">⚡ {dueWords.length} due</span>}
        </div>
        <div className="cta-row">
          {dueWords.length > 0 ? (
            <Link className="btn btn-primary btn-lg" to="/review">
              Review {dueWords.length} now
            </Link>
          ) : (
            <Link className="btn btn-primary btn-lg" to="/add">
              Capture a word
            </Link>
          )}
          <Link className="btn btn-ghost btn-lg" to={dueWords.length > 0 ? '/add' : '/library'}>
            {dueWords.length > 0 ? 'Add new word' : 'My words'}
          </Link>
        </div>
      </section>

      {session?.user.id && <WordOfTheDay userId={session.user.id} />}

      {available && inbox.length > 0 && (
        <Link to="/inbox" className="inbox-banner">
          <span className="inbox-banner-emoji" aria-hidden>💌</span>
          <span>
            <strong>{senders.slice(0, 2).join(' & ')}{senders.length > 2 ? ' + more' : ''}</strong> sent you{' '}
            {inbox.length} word{inbox.length === 1 ? '' : 's'}
          </span>
          <span className="inbox-banner-cta">Open →</span>
        </Link>
      )}

      <div className="metrics">
        <div className="metric metric-due">
          <div className="metric-label">Due</div>
          <div className="metric-value">{dueWords.length}</div>
        </div>
        <div className="metric metric-streak">
          <div className="metric-label">Streak</div>
          <div className="metric-value">{stats.streak}d</div>
        </div>
        <div className="metric metric-total">
          <div className="metric-label">Words</div>
          <div className="metric-value">{words.length}</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Fresh drops</h2>
            <p className="section-sub">Tap a word to reveal its meaning</p>
          </div>
          {words.length > 0 && (
            <Link className="btn btn-ghost btn-sm" to="/library">
              See all
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="empty">
            <div className="empty-emoji" aria-hidden>🌱</div>
            <h3>No words yet</h3>
            <p>Type any English word you want to keep. Retain finds the meaning in English and Hindi, plus two example sentences.</p>
            <Link className="btn btn-primary" to="/add">
              Add your first word
            </Link>
          </div>
        ) : (
          <div className="word-list">
            {recent.map((word) => (
              <WordCard key={word.id} word={word} />
            ))}
          </div>
        )}
      </section>
    </>
  )
}
