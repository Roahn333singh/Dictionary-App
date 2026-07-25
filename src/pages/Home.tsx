import { Link } from 'react-router-dom'
import { WordCard } from '../components/WordCard'
import { useVocab } from '../hooks/useVocab'

export function Home() {
  const { words, dueWords, stats } = useVocab()
  const recent = words.slice(0, 5)
  const mastered = words.filter((w) => w.repetitions >= 5 && w.intervalDays >= 14).length

  return (
    <>
      <section className="hero">
        <p className="hero-kicker">Your speaking vocabulary</p>
        <h1 className="hero-title">
          Words you meet. <em>Words you keep.</em>
        </h1>
        <p className="hero-sub">
          Type any useful English word — Retain fills English and Hindi meanings plus two
          example sentences, then reminds you to revise so it stays ready when you speak.
        </p>
        <div className="cta-row">
          {dueWords.length > 0 ? (
            <Link className="btn btn-primary" to="/review">
              Review {dueWords.length} due
            </Link>
          ) : (
            <Link className="btn btn-primary" to="/add">
              Capture a word
            </Link>
          )}
          <Link className="btn btn-ghost" to={dueWords.length > 0 ? '/add' : '/library'}>
            {dueWords.length > 0 ? 'Add new word' : 'Browse library'}
          </Link>
        </div>
      </section>

      <div className="metrics">
        <div className="metric">
          <div className="metric-label">Due today</div>
          <div className="metric-value gold">{dueWords.length}</div>
        </div>
        <div className="metric">
          <div className="metric-label">Streak</div>
          <div className="metric-value mint">{stats.streak}d</div>
        </div>
        <div className="metric">
          <div className="metric-label">In vault</div>
          <div className="metric-value sky">{words.length}</div>
        </div>
      </div>

      <section className="section">
        <div className="section-head">
          <div>
            <h2 className="section-title">Recent captures</h2>
            <p className="section-sub">
              {mastered > 0
                ? `${mastered} word${mastered === 1 ? '' : 's'} settling into long-term memory`
                : 'Tap a word to reveal its meaning'}
            </p>
          </div>
          {words.length > 0 && (
            <Link className="btn btn-ghost" to="/library">
              See all
            </Link>
          )}
        </div>

        {recent.length === 0 ? (
          <div className="empty">
            <h3>No words yet</h3>
            <p>
              Type any English word you want to keep. Retain looks up the meaning in English
              and Hindi, plus two example sentences you can actually speak.
            </p>
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
