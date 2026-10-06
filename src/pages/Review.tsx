import { useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { Link } from 'react-router-dom'
import { useVocab } from '../hooks/useVocab'
import { compactText } from '../lib/enrich'
import { haptic, turnPageFx, unlockReviewFx } from '../lib/reviewFx'
import type { ReviewRating, VocabWord } from '../types'

const SWIPE_PX = 72
const SWIPE_VX = 0.55

type Drag = {
  id: number
  startX: number
  startY: number
  lastX: number
  lastT: number
  vx: number
  armed: boolean
}

function CardFace({
  word,
  revealed,
  onReveal,
}: {
  word: VocabWord
  revealed: boolean
  onReveal?: () => void
}) {
  const examples = word.examples.filter((e, i, all) => e && all.indexOf(e) === i)
  return (
    <>
      <div className="flash-prompt">Can you use this?</div>
      <div className="flash-word">{word.word}</div>
      {word.phonetic && <div className="flash-phonetic">{word.phonetic}</div>}

      {!revealed ? (
        <>
          <p className="flash-hint">
            Say the meaning in English (and Hindi if you can), then try one short sentence of your own.
          </p>
          {onReveal && (
            <button className="btn btn-primary" type="button" onClick={onReveal}>
              Reveal meaning
            </button>
          )}
        </>
      ) : (
        <div className="flash-reveal">
          {compactText(word.meaning) && (
            <div className="reveal-block">
              <h3>English</h3>
              <p>{compactText(word.meaning)}</p>
            </div>
          )}
          {compactText(word.meaningHi) && (
            <div className="reveal-block">
              <h3>Hindi</h3>
              <p className="hindi-text">{compactText(word.meaningHi)}</p>
            </div>
          )}
          {examples.map((ex, i) => (
            <div key={i} className="reveal-block sentence">
              <h3>Example {i + 1}</h3>
              <p>“{ex}”</p>
            </div>
          ))}
          {compactText(word.notes) && (
            <div className="reveal-block">
              <h3>Notes</h3>
              <p>{compactText(word.notes)}</p>
            </div>
          )}
          <div className="speak-tip">Say one example aloud — then invent your own</div>
        </div>
      )}
    </>
  )
}

export function Review() {
  const { dueWords, reviewWord } = useVocab()
  const [queue, setQueue] = useState<VocabWord[]>([])
  const [index, setIndex] = useState(0)
  const [open, setOpen] = useState<Record<string, boolean>>({})
  const [sessionDone, setSessionDone] = useState(0)
  const [started, setStarted] = useState(false)
  const [flipping, setFlipping] = useState(false)

  const frontRef = useRef<HTMLDivElement>(null)
  const glowRef = useRef<HTMLDivElement>(null)
  const dragRef = useRef<Drag | null>(null)
  const flippingRef = useRef(false)
  flippingRef.current = flipping
  const indexRef = useRef(0)
  indexRef.current = index
  const totalRef = useRef(0)

  useEffect(() => {
    const lateArrivals = started && queue.length === 0 && sessionDone === 0 && dueWords.length > 0
    if (!started || lateArrivals) {
      setQueue(dueWords)
      setIndex(0)
      setOpen({})
      setSessionDone(0)
      setStarted(true)
    }
  }, [dueWords, started, queue.length, sessionDone])

  const current = queue[index]
  const peek = queue[index + 1]
  const total = queue.length
  totalRef.current = total
  const revealed = current ? Boolean(open[current.id]) : false
  const bar = total === 0 ? 100 : Math.round((index / total) * 100)

  const intervals = useMemo(() => {
    if (!current) return null
    return {
      again: '10m',
      hard: current.repetitions === 0 ? '12h' : '~1.5×',
      good: current.repetitions === 0 ? '1d' : '~2.5×',
      easy: current.repetitions === 0 ? '3d' : '~3×',
    }
  }, [current])

  function resetFront(transition: string, transform: string) {
    const el = frontRef.current
    if (!el) return
    el.style.transition = transition
    el.style.transform = transform
    if (glowRef.current) {
      glowRef.current.style.transition = 'opacity 0.2s ease'
      glowRef.current.style.opacity = '0'
    }
  }

  function paint(x: number) {
    const el = frontRef.current
    if (!el) return
    const w = el.offsetWidth || 320
    const nx = x / w
    const rotY = Math.max(-42, Math.min(42, -nx * 58))
    const rotZ = nx * 10
    const lift = Math.min(18, Math.abs(x) / 16)
    el.style.transition = 'none'
    el.style.transform = `translate3d(${x}px, ${-lift}px, 40px) rotateY(${rotY}deg) rotateZ(${rotZ}deg)`
    const glow = glowRef.current
    if (glow) {
      const p = Math.min(1, Math.abs(x) / 90)
      glow.style.transition = 'none'
      glow.style.opacity = String(0.25 + p * 0.75)
      glow.style.setProperty('--rainbow-angle', `${(x * 1.6 + 40) % 360}deg`)
    }
  }

  function goTo(nextIndex: number, dir: 1 | -1) {
    if (flippingRef.current) return
    if (nextIndex < 0 || nextIndex > totalRef.current) return
    if (nextIndex === indexRef.current) return
    setFlipping(true)
    flippingRef.current = true
    turnPageFx()
    const el = frontRef.current
    if (el) {
      const fly = dir === 1 ? -window.innerWidth * 0.72 : window.innerWidth * 0.72
      el.style.transition = 'transform 0.32s cubic-bezier(0.2, 0.7, 0.2, 1), opacity 0.32s ease'
      el.style.transform = `translate3d(${fly}px, -12px, 80px) rotateY(${dir === 1 ? -88 : 88}deg) rotateZ(${dir === 1 ? -12 : 12}deg)`
      el.style.opacity = '0'
    }
    window.setTimeout(() => {
      setIndex(nextIndex)
      setFlipping(false)
      requestAnimationFrame(() => {
        const card = frontRef.current
        if (!card) return
        card.style.transition = 'none'
        card.style.opacity = '1'
        card.style.transform = `translate3d(${dir === 1 ? 40 : -40}px, 8px, 0) rotateY(${dir === 1 ? 12 : -12}deg)`
        requestAnimationFrame(() => {
          card.style.transition = 'transform 0.28s var(--ease-pop)'
          card.style.transform = 'none'
        })
      })
    }, 280)
  }

  function settle(x: number, vx: number) {
    const width = frontRef.current?.offsetWidth || 320
    const pass = Math.abs(x) > Math.min(SWIPE_PX, width * 0.22) || Math.abs(vx) > SWIPE_VX
    if (!pass) {
      resetFront('transform 0.35s var(--ease-pop)', 'none')
      return
    }
    const dir: 1 | -1 = x < 0 || vx < -SWIPE_VX ? 1 : -1
    const next = indexRef.current + dir
    if (next < 0 || next > totalRef.current) {
      resetFront('transform 0.4s var(--ease-pop)', 'none')
      haptic(8)
      return
    }
    goTo(next, dir)
  }

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    if (flipping) return
    if ((e.target as HTMLElement).closest('button, a, input, textarea')) return
    unlockReviewFx()
    dragRef.current = {
      id: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      lastX: e.clientX,
      lastT: performance.now(),
      vx: 0,
      armed: false,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const dx = e.clientX - d.startX
    const dy = e.clientY - d.startY
    if (!d.armed) {
      if (Math.abs(dx) < 10 && Math.abs(dy) < 10) return
      if (Math.abs(dy) > Math.abs(dx) * 1.2) {
        dragRef.current = null
        return
      }
      d.armed = true
      haptic(7)
      e.currentTarget.classList.add('is-dragging')
    }
    const now = performance.now()
    const dt = Math.max(8, now - d.lastT)
    d.vx = (e.clientX - d.lastX) / dt
    d.lastX = e.clientX
    d.lastT = now
    let x = dx
    if (indexRef.current === 0 && x > 0) x *= 0.28
    paint(x)
  }

  function onPointerUp(e: ReactPointerEvent<HTMLDivElement>) {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    e.currentTarget.classList.remove('is-dragging')
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    if (!d.armed) return
    const x = e.clientX - d.startX
    settle(indexRef.current === 0 && x > 0 ? x * 0.28 : x, d.vx)
  }

  function rate(rating: ReviewRating) {
    if (!current || !revealed || flipping) return
    reviewWord(current.id, rating)
    setSessionDone((n) => n + 1)
    goTo(index + 1, 1)
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'ArrowRight') goTo(indexRef.current + 1, 1)
      if (e.key === 'ArrowLeft') goTo(indexRef.current - 1, -1)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  if (!started) return null

  if (total === 0 || index >= total) {
    return (
      <div className="review-stage">
        <div className="done-panel">
          <div className="empty-emoji" aria-hidden>{sessionDone > 0 ? '🔥' : '✨'}</div>
          <h2>{sessionDone > 0 ? 'Brain = fed.' : 'All clear.'}</h2>
          <p>
            {sessionDone > 0
              ? `You rated ${sessionDone} word${sessionDone === 1 ? '' : 's'}. Words you swiped past without rating stay due.`
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
          {index + 1} / {total}
        </span>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${Math.max(bar, 6)}%` }} />
        </div>
        <span>{Math.min(100, bar)}%</span>
      </div>

      <div
        className="deck"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
      >
        {peek && (
          <div className="flashcard deck-peek" aria-hidden>
            <div className="flash-prompt">Up next</div>
            <div className="flash-word">{peek.word}</div>
          </div>
        )}

        <div className="flashcard deck-front" ref={frontRef} key={current.id}>
          <div className="deck-rainbow" ref={glowRef} aria-hidden />
          <CardFace
            word={current}
            revealed={revealed}
            onReveal={() => setOpen((prev) => ({ ...prev, [current.id]: true }))}
          />
        </div>
      </div>

      <p className="swipe-hint">Swipe to the next card — reveal only if you want to rate it</p>

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
