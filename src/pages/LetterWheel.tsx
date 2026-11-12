import { useMemo, useRef, useState, type PointerEvent } from 'react'

const SIZE = 320
const CENTER = SIZE / 2
const RADIUS = 116
const HIT_RADIUS = 22

type Point = { x: number; y: number }

type Gesture = {
  id: number
  bounds: DOMRect
  start: Point
  previous: Point
  path: number[]
  lastHit: number
  dragging: boolean
}

type Props = {
  letters: string[]
  answerLength: number
  disabled: boolean
  onShuffle: () => void
  onSubmit: (word: string) => void
}

export function LetterWheel({ letters, answerLength, disabled, onShuffle, onSubmit }: Props) {
  const [draft, setDraft] = useState<number[]>([])
  const canvas = useRef<HTMLCanvasElement>(null)
  const gesture = useRef<Gesture | null>(null)
  const positions = useMemo(() => letters.map((_, index) => {
    const angle = index * 2 * Math.PI / letters.length - Math.PI / 2
    return { x: CENTER + RADIUS * Math.cos(angle), y: CENTER + RADIUS * Math.sin(angle) }
  }), [letters])
  const word = draft.map((index) => letters[index]).join('')

  function paint(path: number[], end?: Point) {
    const ctx = canvas.current?.getContext('2d')
    if (!ctx) return
    ctx.clearRect(0, 0, SIZE, SIZE)
    if (!path.length) return
    const first = positions[path[0]]
    ctx.beginPath()
    ctx.moveTo(first.x, first.y)
    for (const index of path.slice(1)) ctx.lineTo(positions[index].x, positions[index].y)
    if (end) ctx.lineTo(end.x, end.y)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 11
    ctx.strokeStyle = '#1e123b3d'
    ctx.stroke()
    ctx.lineWidth = 7
    ctx.strokeStyle = '#9848df'
    ctx.stroke()
  }

  function reset() {
    setDraft([])
    paint([])
  }

  function pick(index: number) {
    if (disabled || gesture.current || draft.length >= answerLength || draft.includes(index)) return
    const next = [...draft, index]
    setDraft(next)
    paint(next)
  }

  function start(event: PointerEvent<HTMLDivElement>) {
    if (disabled || !event.isPrimary || event.button !== 0 || gesture.current) return
    const token = (event.target as Element).closest<HTMLButtonElement>('button[data-wheel-index]')
    if (!token) return
    const bounds = event.currentTarget.getBoundingClientRect()
    const point = wheelPoint(event, bounds)
    const index = Number(token.dataset.wheelIndex)
    gesture.current = {
      id: event.pointerId, bounds, start: point, previous: point,
      path: [index], lastHit: index, dragging: false,
    }
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function move(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    const point = wheelPoint(event, current.bounds)
    if (!current.dragging && Math.hypot(point.x - current.start.x, point.y - current.start.y) < 9) return
    const wasDragging = current.dragging
    current.dragging = true
    const { previous, path } = current
    const steps = Math.max(1, Math.min(90, Math.ceil(Math.hypot(point.x - previous.x, point.y - previous.y) / 7)))
    let changed = !wasDragging

    // Sample between pointer events so fast strokes can still hit a letter.
    for (let step = 1; step <= steps; step++) {
      const x = previous.x + (point.x - previous.x) * step / steps
      const y = previous.y + (point.y - previous.y) * step / steps
      const hit = positions.findIndex((position) => Math.hypot(x - position.x, y - position.y) <= HIT_RADIUS)
      if (hit < 0 || hit === current.lastHit) continue
      current.lastHit = hit
      if (hit === path.at(-2)) {
        path.pop()
        changed = true
      } else if (!path.includes(hit) && path.length < answerLength) {
        path.push(hit)
        changed = true
      }
    }
    current.previous = point
    if (changed) setDraft([...path])
    paint(path, path.length < answerLength ? point : undefined)
  }

  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = gesture.current
    if (!current || current.id !== event.pointerId) return
    move(event)
    gesture.current = null
    if (current.dragging) {
      const submitted = current.path.map((index) => letters[index]).join('')
      reset()
      if (submitted.length > 1) onSubmit(submitted)
    } else {
      pick(current.path[0])
    }
  }

  function cancel(event: PointerEvent<HTMLDivElement>) {
    if (gesture.current?.id !== event.pointerId) return
    gesture.current = null
    reset()
  }

  return (
    <section className="z-wheel-panel" aria-label="Letter wheel">
      <div className="z-wheel-compose">
        <button type="button" className="z-wheel-tool" disabled={!draft.length}
          aria-label="Remove last letter" onClick={() => {
            const next = draft.slice(0, -1)
            setDraft(next)
            paint(next)
          }}>⌫</button>
        <div className="z-wheel-word" aria-live="polite">
          {word || <span>Swipe or tap letters</span>}
        </div>
        <button type="button" className="z-wheel-tool z-wheel-submit" disabled={draft.length !== answerLength}
          aria-label="Submit word" onClick={() => {
            reset()
            onSubmit(word)
          }}>✓</button>
      </div>
      <div className="z-wheel" onPointerDown={start} onPointerMove={move} onPointerUp={finish}
        onPointerCancel={cancel} onLostPointerCapture={(event) => {
          if (event.target === event.currentTarget) cancel(event)
        }}>
        <canvas ref={canvas} width={SIZE} height={SIZE} aria-hidden="true" />
        <button type="button" className="z-wheel-shuffle" aria-label="Shuffle letters" disabled={disabled}
          onClick={() => {
            reset()
            onShuffle()
          }}>⤨</button>
        {letters.map((letter, index) => (
          <button key={index} type="button" className="z-wheel-letter" data-wheel-index={index}
            aria-label={`Choose letter ${letter}`} aria-pressed={draft.includes(index)} disabled={disabled}
            style={{ left: `${positions[index].x / SIZE * 100}%`, top: `${positions[index].y / SIZE * 100}%` }}
            onClick={(event) => {
              // Pointer taps are handled on release. Native keyboard and assistive clicks have no pointer count.
              if (event.detail === 0) pick(index)
            }}>{letter}</button>
        ))}
      </div>
    </section>
  )
}

function wheelPoint(event: PointerEvent<HTMLDivElement>, bounds: DOMRect): Point {
  return {
    x: (event.clientX - bounds.left) / bounds.width * SIZE,
    y: (event.clientY - bounds.top) / bounds.height * SIZE,
  }
}
