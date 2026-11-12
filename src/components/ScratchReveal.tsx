import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { haptic } from '../lib/reviewFx'

export const REVEAL_AT = 42

type Props = {
  revealed: boolean
  onReveal: () => void
  coverPill: string
  compact?: boolean
  children: ReactNode
}

/** Foil that the user rubs away. The real content sits underneath from the
 *  start, so scratching genuinely uncovers it piece by piece. */
export function ScratchReveal({ revealed, onReveal, coverPill, compact, children }: Props) {
  const [scratchPct, setScratchPct] = useState(revealed ? 100 : 0)
  const wrapRef = useRef<HTMLDivElement>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const scratchingRef = useRef(false)
  const lastPointRef = useRef<{ x: number; y: number } | null>(null)
  const lastCheckRef = useRef(0)
  const revealedRef = useRef(revealed)
  revealedRef.current = revealed
  const onRevealRef = useRef(onReveal)
  onRevealRef.current = onReveal

  useEffect(() => {
    if (revealed) setScratchPct(100)
  }, [revealed])

  // Paint the foil once on screen. Colours come from the active theme so the
  // foil looks right in Midnight, Matcha, Sunset and Bubblegum.
  useEffect(() => {
    if (revealedRef.current) return
    const canvas = canvasRef.current
    const wrap = wrapRef.current
    if (!canvas || !wrap) return
    const rect = wrap.getBoundingClientRect()
    if (rect.width < 10 || rect.height < 10) return

    const dpr = Math.min(2, window.devicePixelRatio || 1)
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    const styles = getComputedStyle(document.documentElement)
    const foil = styles.getPropertyValue('--accent').trim() || '#c6ff3d'
    const ink = styles.getPropertyValue('--on-accent').trim() || '#101014'
    const sparkle = styles.getPropertyValue('--yellow').trim() || foil

    ctx.globalCompositeOperation = 'source-over'
    ctx.fillStyle = foil
    ctx.fillRect(0, 0, rect.width, rect.height)

    ctx.save()
    ctx.translate(rect.width / 2, rect.height / 2)
    ctx.rotate(-0.32)
    ctx.fillStyle = ink
    ctx.globalAlpha = 0.07
    for (let x = -rect.width; x < rect.width; x += 30) {
      ctx.fillRect(x, -rect.height, 13, rect.height * 2)
    }
    ctx.restore()

    ctx.globalAlpha = 1
    for (let i = 0; i < 420; i++) {
      ctx.fillStyle = Math.random() > 0.5 ? sparkle : ink
      ctx.globalAlpha = 0.08 + Math.random() * 0.16
      ctx.beginPath()
      ctx.arc(Math.random() * rect.width, Math.random() * rect.height, 0.8 + Math.random() * 1.9, 0, Math.PI * 2)
      ctx.fill()
    }
    ctx.globalAlpha = 1
    setScratchPct(0)
  }, [])

  function markRevealed() {
    if (revealedRef.current) return
    haptic([10, 30, 14])
    onRevealRef.current()
  }

  function scratchPoint(e: ReactPointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    return { x: e.clientX - rect.left, y: e.clientY - rect.top }
  }

  function eraseAt(x: number, y: number, from: { x: number; y: number } | null) {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    const dpr = Math.min(2, window.devicePixelRatio || 1)
    ctx.save()
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.globalCompositeOperation = 'destination-out'
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.lineWidth = 46
    ctx.beginPath()
    if (from) {
      ctx.moveTo(from.x, from.y)
      ctx.lineTo(x, y)
    } else {
      ctx.moveTo(x, y)
      ctx.lineTo(x + 0.1, y + 0.1)
    }
    ctx.stroke()
    ctx.restore()
  }

  function measureScratch(force = false) {
    const now = performance.now()
    if (!force && now - lastCheckRef.current < 110) return
    lastCheckRef.current = now
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx || canvas.width === 0 || canvas.height === 0) return
    try {
      const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height)
      let cleared = 0
      let sampled = 0
      for (let i = 3; i < data.length; i += 4 * 18) {
        sampled += 1
        if (data[i] === 0) cleared += 1
      }
      const pct = sampled ? Math.round((cleared / sampled) * 100) : 0
      setScratchPct(pct)
      if (pct >= REVEAL_AT) markRevealed()
    } catch {
      // Canvas sampling can be blocked in rare private modes; the reveal
      // button below still gives everyone a way through.
    }
  }

  function onScratchDown(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (revealedRef.current) return
    e.preventDefault()
    scratchingRef.current = true
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // capture is a nicety, not a requirement
    }
    const point = scratchPoint(e)
    lastPointRef.current = point
    if (point) eraseAt(point.x, point.y, null)
    haptic(5)
  }

  function onScratchMove(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!scratchingRef.current || revealedRef.current) return
    e.preventDefault()
    const point = scratchPoint(e)
    if (!point) return
    eraseAt(point.x, point.y, lastPointRef.current)
    lastPointRef.current = point
    measureScratch()
  }

  function onScratchUp(e: ReactPointerEvent<HTMLCanvasElement>) {
    if (!scratchingRef.current) return
    scratchingRef.current = false
    lastPointRef.current = null
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // already released
    }
    measureScratch(true)
  }

  return (
    <>
      <div className={`scratch-wrap${compact ? ' scratch-wrap--compact' : ''}`} ref={wrapRef}>
        <div className="scratch-under">{children}</div>

        <canvas
          ref={canvasRef}
          className={`scratch-canvas${revealed ? ' is-revealed' : ''}`}
          onPointerDown={onScratchDown}
          onPointerMove={onScratchMove}
          onPointerUp={onScratchUp}
          onPointerCancel={onScratchUp}
          aria-hidden="true"
        />
        {!revealed && (
          <div
            className="scratch-cover-label"
            style={{ opacity: Math.max(0, 1 - scratchPct / REVEAL_AT) }}
            aria-hidden="true"
          >
            <span className="scratch-cover-pill">{coverPill}</span>
            <span className="scratch-cover-title">Scratch here</span>
            <span className="scratch-cover-sub">Rub the foil with your finger or mouse</span>
          </div>
        )}
      </div>

      {!revealed && (
        <div className="scratch-status">
          <div className="scratch-progress" aria-hidden="true">
            <span style={{ width: `${Math.min(100, (scratchPct / REVEAL_AT) * 100)}%` }} />
          </div>
          <span>{scratchPct > 2 ? `${scratchPct}% scratched` : 'Scratch the card to reveal the word'}</span>
          <button type="button" className="scratch-reveal-btn" onClick={markRevealed}>
            Reveal without scratching
          </button>
        </div>
      )}
    </>
  )
}
