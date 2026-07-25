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
    if (!started) {
      setQueue(dueWords)
      setIndex(0)
      setRevealed(false)
      setSessionDone(0)
      setStarted(true)
    }
  }, [dueWords, started])

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

  function rate(rating: ReviewRating) {
    if (!current) return
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
          <h2>{sessionDone > 0 ? 'Fresh again.' : 'All clear.'}</h2>
          <p>
            {sessionDone > 0
              ? `You revised ${sessionDone} word${sessionDone === 1 ? '' : 's'}. Come back when the next batch is due — consistency beats cramming.`
              : 'Nothing is due right now. Capture a new word, or check your library.'}
          </p>
          <div className="cta-row" style={{ justifyContent: 'center' }}>
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
      <div className="page-head" style={{ marginBottom: '1rem' }}>
        <h1>Review</h1>
        <p>Recall the English and Hindi meaning, then check the example sentences.</p>
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
            <div className="reveal-block sentence">
              <h3>Example 1</h3>
              <p>“{current.examples[0]}”</p>
            </div>
            <div className="reveal-block sentence">
              <h3>Example 2</h3>
              <p>“{current.examples[1]}”</p>
            </div>
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
          <button className="btn btn-coral" type="button" onClick={() => rate('again')}>
            Again
            <small>{intervals.again}</small>
          </button>
          <button className="btn btn-sky" type="button" onClick={() => rate('hard')}>
            Hard
            <small>{intervals.hard}</small>
          </button>
          <button className="btn btn-mint" type="button" onClick={() => rate('good')}>
            Good
            <small>{intervals.good}</small>
          </button>
          <button className="btn btn-gold" type="button" onClick={() => rate('easy')}>
            Easy
            <small>{intervals.easy}</small>
          </button>
        </div>
      )}
    </div>
  )
}
