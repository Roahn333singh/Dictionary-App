import { useEffect, useRef } from 'react'
import './zmode-entry.css'

/** Matches zmode_entry.mp4 (12.000s). Puzzle mounts just as the hold fades. */
const ARRIVE_MS = 11550
const DONE_MS = 12000

const LINES = [
  { text: '> SIGNAL LOCKED', at: '5.98s', dur: '0.42s', steps: 16, check: '6.42s' },
  { text: '> DICTIONARY → GRID', at: '6.58s', dur: '0.58s', steps: 20, check: '7.18s' },
  { text: '> FILLING LETTER JAR', at: '7.22s', dur: '0.42s', steps: 21, check: '7.66s' },
  { text: '> SCORE ENGINE ONLINE', at: '7.88s', dur: '0.52s', steps: 22, check: '8.42s' },
] as const

const SHARDS = [
  { x: '-42vw', y: '-36vh', r: '-22deg', d: '0s' },
  { x: '6vw', y: '-48vh', r: '14deg', d: '0.02s' },
  { x: '46vw', y: '-28vh', r: '24deg', d: '0.04s' },
  { x: '-50vw', y: '4vh', r: '-16deg', d: '0.03s' },
  { x: '2vw', y: '-6vh', r: '6deg', d: '0.01s' },
  { x: '44vw', y: '8vh', r: '18deg', d: '0.05s' },
  { x: '-36vw', y: '42vh', r: '-20deg', d: '0.04s' },
  { x: '8vw', y: '50vh', r: '10deg', d: '0.02s' },
  { x: '40vw', y: '38vh', r: '26deg', d: '0.03s' },
] as const

const TILES = [
  { l: 'W', x: '12%', y: '32%', r: '-8deg', at: '3.55s' },
  { l: 'O', x: '24%', y: '42%', r: '6deg', at: '3.62s', hot: true },
  { l: 'R', x: '16%', y: '54%', r: '-4deg', at: '3.7s' },
  { l: 'D', x: '28%', y: '64%', r: '11deg', at: '3.66s' },
  { l: 'S', x: '18%', y: '74%', r: '-7deg', at: '3.8s' },
  { l: 'Z', x: '44%', y: '46%', r: '0deg', at: '3.72s', hot: true },
  { l: 'T', x: '58%', y: '40%', r: '8deg', at: '3.64s' },
  { l: 'A', x: '70%', y: '50%', r: '-11deg', at: '3.78s' },
  { l: 'M', x: '78%', y: '34%', r: '12deg', at: '3.58s', hot: true },
  { l: 'E', x: '74%', y: '24%', r: '-6deg', at: '3.84s' },
  { l: 'N', x: '60%', y: '66%', r: '5deg', at: '3.74s' },
  { l: 'R', x: '82%', y: '60%', r: '-9deg', at: '3.88s' },
] as const

const FIELD = 'RETAINZMODEJARSCOREWORDSCGRIDLOCK'

const SPARKS = [
  { at: '6.45s', x: '16%' },
  { at: '7.55s', x: '42%' },
  { at: '8.48s', x: '70%' },
  { at: '9.05s', x: '96%' },
] as const

type Props = {
  /** Mount the puzzle underneath while the last frames are still up. */
  onArrive: () => void
  /** Leave the overlay. `skipped` stops the stinger. */
  onDone: (skipped: boolean) => void
}

export function ZModeEntry({ onArrive, onDone }: Props) {
  const skipRef = useRef<HTMLButtonElement>(null)
  const onArriveRef = useRef(onArrive)
  const onDoneRef = useRef(onDone)
  onArriveRef.current = onArrive
  onDoneRef.current = onDone

  useEffect(() => {
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (reduce) {
      onDoneRef.current(true)
      return
    }

    document.documentElement.classList.add('z-entry-live')
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    skipRef.current?.focus({ preventScroll: true })

    const arrive = window.setTimeout(() => onArriveRef.current(), ARRIVE_MS)
    const done = window.setTimeout(() => onDoneRef.current(false), DONE_MS)
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      event.preventDefault()
      onDoneRef.current(true)
    }
    window.addEventListener('keydown', onKey)

    return () => {
      document.documentElement.classList.remove('z-entry-live')
      document.body.style.overflow = prevOverflow
      window.clearTimeout(arrive)
      window.clearTimeout(done)
      window.removeEventListener('keydown', onKey)
    }
  }, [])

  return (
    <div className="z-entry" role="dialog" aria-modal="true" aria-label="Entering Z-mode">
      <div className="z-entry-vignette" aria-hidden />
      <div className="z-entry-glitch" aria-hidden />
      <div className="z-entry-wash" aria-hidden />
      <div className="z-entry-scrim" aria-hidden />
      <div className="z-entry-dust" aria-hidden />

      <div className="z-entry-shards" aria-hidden>
        {SHARDS.map((shard) => (
          <span
            key={`${shard.x}${shard.y}`}
            className="z-entry-shard"
            style={{ ['--x' as string]: shard.x, ['--y' as string]: shard.y, ['--r' as string]: shard.r, ['--d' as string]: shard.d }}
          />
        ))}
      </div>

      <div className="z-entry-hero" aria-hidden>
        Z
      </div>
      <div className="z-entry-warp" aria-hidden />
      <div className="z-entry-horizon" aria-hidden />

      <div className="z-entry-tiles" aria-hidden>
        {TILES.map((tile) => (
          <span
            key={`${tile.l}${tile.x}${tile.y}`}
            className={'hot' in tile && tile.hot ? 'z-entry-tile is-hot' : 'z-entry-tile'}
            style={{
              ['--x' as string]: tile.x,
              ['--y' as string]: tile.y,
              ['--r' as string]: tile.r,
              ['--at' as string]: tile.at,
            }}
          >
            {tile.l}
          </span>
        ))}
      </div>

      <div className="z-entry-slam" aria-hidden>
        Z
      </div>

      <div className="z-entry-field" aria-hidden>
        {FIELD.split('').map((letter, i) => (
          <span key={`${letter}${i}`}>{letter}</span>
        ))}
      </div>

      <div className="z-entry-card">
        <div className="z-entry-mark" aria-hidden>
          Z
        </div>
        <p className="z-entry-kicker">
          <span className="z-entry-kicker-glitch" aria-hidden>
            ENTERING UJZX+D+ EKLJO
          </span>
          <span className="z-entry-kicker-real">ENTERING ANOTHER WORLD</span>
        </p>
        <ul className="z-entry-log">
          {LINES.map((line) => (
            <li
              key={line.text}
              style={{ animation: `z-line-open 0.05s linear ${line.at} forwards` }}
            >
              <span
                className="z-entry-type"
                style={{
                  animation: `z-type ${line.dur} steps(${line.steps}, end) ${line.at} forwards`,
                }}
              >
                {line.text}
              </span>
              <span
                className="z-entry-check"
                style={{ animation: `z-check 0.18s ease ${line.check} forwards` }}
                aria-hidden
              >
                ✓
              </span>
            </li>
          ))}
        </ul>
        <p className="z-entry-engaged">Z-MODE ENGAGED</p>
        <div className="z-entry-bar" aria-hidden>
          <span className="z-entry-bar-fill" />
          {SPARKS.map((spark) => (
            <span
              key={spark.at}
              className="z-entry-spark"
              style={{ ['--at' as string]: spark.at, ['--x' as string]: spark.x }}
            />
          ))}
        </div>
      </div>

      <button
        ref={skipRef}
        type="button"
        className="z-entry-skip"
        onClick={() => onDone(true)}
      >
        Skip
      </button>
    </div>
  )
}
