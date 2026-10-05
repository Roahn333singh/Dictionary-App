import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useVocab } from '../hooks/useVocab'
import type { ReviewRating, VocabWord } from '../types'

export function Review() {
  const { dueWords, reviewWord } = useVocab()
  const [queue, setQueue] = useState<VocabWord[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [sessionDone, setSessionDone] = useState(0)
  const [started, setStarted] = useState(false)

  useEffect(() => {
    const lateArrivals = started && queue.length === 0 && sessionDone === 0 && dueWords.length > 0
    if (!started || lateArrivals) {
      setQueue(dueWords)
      setIndex(0)
      setRevealed(false)
      setSessionDone(0)
      setStarted(true)
    }
  }, [dueWords, started, queue.length, sessionDone])

  const current = queue[index]
  const total = queue.length
  const progress = total === 0 ? 100 : Math.round((sessionDone / total) * 100)

  const intervals = useMemo(() => {
    if (!current) return null
    return {
      again: '10m',
      hard: current.repetitions === 0 ? '12h' : '~1.5×',
      good: current.repetitions === 0 ? '1d' : '~2.5×',
      easy: current.repetitions === 0 ? '3d' : '~3×',
    }
  }, [current])

  const examples = current ? current.examples.filter((e, i, all) => e && all.indexOf(e) === i) : []

  function rate(rating: ReviewRating) {
    if (!current || !revealed) return
    reviewWord(current.id, rating)
    setSessionDone((n) => n + 1)
    setRevealed(false)
    setIndex((i) => i + 1)
  }

  if (!started) return null

  if (total === 0 || index >= total) {
    return (
      <div className="review-stage">
        <div className="done-panel">
          <div className="empty-emoji" aria-hidden>{sessionDone > 0 ? '🔥' : '✨'}</div>
          <h2>{sessionDone > 0 ? 'Brain = fed.' : 'All clear.'}</h2>
          <p>
            {sessionDone > 0
              ? `You revised ${sessionDone} word${sessionDone === 1 ? '' : 's'}. Come back when the next batch is due — consistency beats cramming.`
              : 'Nothing is due right now. Capture a new word, or check your library.'}
          </p>
          <div className="cta-row cta-center">
            <Link className="btn btn-primary" to="/add">
              Add a word
            </Link>
            <Link className="btn btn-ghost" to="/">
              Back home
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="review-stage">
      <div className="page-head">
        <p className="eyebrow">Review time</p>
        <h1>Do you know it?</h1>
      </div>

      <div className="review-progress">
        <span>
          {Math.min(sessionDone + 1, total)} / {total}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <span>{progress}%</span>
      </div>

      <div className="flashcard" key={current.id}>
        <div className="flash-prompt">Can you use this?</div>
        <div className="flash-word">{current.word}</div>
        {current.phonetic && <div className="flash-phonetic">{current.phonetic}</div>}

        {!revealed ? (
          <>
            <p className="flash-hint">
              Say the meaning in English (and Hindi if you can), then try one short sentence of your own.
            </p>
            <button className="btn btn-primary" type="button" onClick={() => setRevealed(true)}>
              Reveal meaning
            </button>
          </>
        ) : (
          <div className="flash-reveal">
            <div className="reveal-block">
              <h3>English</h3>
              <p>{current.meaning}</p>
            </div>
            {current.meaningHi && (
              <div className="reveal-block">
                <h3>Hindi</h3>
                <p className="hindi-text">{current.meaningHi}</p>
              </div>
            )}
            {examples.map((ex, i) => (
              <div key={i} className="reveal-block sentence">
                <h3>Example {i + 1}</h3>
                <p>“{ex}”</p>
              </div>
            ))}
            {current.notes && (
              <div className="reveal-block">
                <h3>Notes</h3>
                <p>{current.notes}</p>
              </div>
            )}
            <div className="speak-tip">Say one example aloud — then invent your own</div>
          </div>
        )}
      </div>

      {revealed && intervals && (
        <div className="rating-row">
          <button className="btn rate-btn rate-again" type="button" onClick={() => rate('again')}>
            <span className="rate-emoji" aria-hidden>😵‍💫</span>
            Again
            <small>{intervals.again}</small>
          </button>
          <button className="btn rate-btn rate-hard" type="button" onClick={() => rate('hard')}>
            <span className="rate-emoji" aria-hidden>😬</span>
            Hard
            <small>{intervals.hard}</small>
          </button>
          <button className="btn rate-btn rate-good" type="button" onClick={() => rate('good')}>
            <span className="rate-emoji" aria-hidden>🙂</span>
            Good
            <small>{intervals.good}</small>
          </button>
          <button className="btn rate-btn rate-easy" type="button" onClick={() => rate('easy')}>
            <span className="rate-emoji" aria-hidden>😎</span>
            Easy
            <small>{intervals.easy}</small>
          </button>
        </div>
      )}
    </div>
  )
}
