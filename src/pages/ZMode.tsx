import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useVocab } from '../hooks/useVocab'
import type { CrosswordCell, CrosswordClue, CrosswordPuzzle } from '../lib/crossword'
import {
  buildFullJar,
  clueFullyFilled,
  clueIsCorrect,
  cullJarForHint1,
  HINT1_MAX_USES,
  hint1Target,
  shuffleJarPositions,
  type JarToken,
} from '../lib/tokenJar'
import {
  computeScore,
  createDailyPuzzle,
  emptyClueState,
  JAR_HINT_PENALTY,
  MEANING_HINT_PENALTY,
  loadBestScore,
  saveBestScore,
  type ClueScoreState,
} from '../lib/zmode'

type Phase = 'play' | 'cleared'

function emptyStates(puzzle: CrosswordPuzzle): Record<string, ClueScoreState> {
  const out: Record<string, ClueScoreState> = {}
  for (const c of puzzle.clues) out[c.id] = emptyClueState()
  return out
}

function LetterJar({
  tokens,
  filtered,
  disabled,
  onPick,
  onShuffle,
}: {
  tokens: JarToken[]
  filtered: boolean
  disabled: boolean
  onPick: (letter: string) => void
  onShuffle: () => void
}) {
  const cols = tokens.length <= 9 ? 3 : tokens.length <= 15 ? 5 : 6

  return (
    <section className={`z-jar ${filtered ? 'is-filtered' : ''}`} aria-label="Letter jar">
      <div className="z-jar-head">
        <h2 className="z-jar-title">Letter Jar</h2>
        <span className="z-jar-count">
          {tokens.length} token{tokens.length === 1 ? '' : 's'}
          {filtered ? ' · culled' : ''}
        </span>
      </div>

      <div className="z-jar-vessel" aria-hidden={false}>
        {/* wooden screw lid */}
        <div className="z-jar-lid" aria-hidden>
          <div className="z-jar-lid-knob" />
          <div className="z-jar-lid-top" />
          <div className="z-jar-lid-ridges">
            <i />
            <i />
            <i />
            <i />
            <i />
          </div>
        </div>

        {/* glass bottle */}
        <div className="z-jar-bottle">
          <div className="z-jar-neck" aria-hidden />
          <div className="z-jar-shoulder" aria-hidden />
          <div className="z-jar-glass">
            <div className="z-jar-shine" aria-hidden />
            <div className="z-jar-shine z-jar-shine-r" aria-hidden />
            <div
              className="z-jar-tokens"
              style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            >
              {tokens.map((token) => (
                <button
                  key={token.id}
                  type="button"
                  className={`z-token z-token-${token.color}`}
                  style={{ transform: `rotate(${token.rot}deg)` }}
                  disabled={disabled}
                  onClick={() => onPick(token.letter)}
                  aria-label={`Place letter ${token.letter}`}
                >
                  <span className="z-token-rim" aria-hidden />
                  <span className="z-token-face">{token.letter}</span>
                </button>
              ))}
            </div>
          </div>
          <div className="z-jar-base" aria-hidden />
        </div>
      </div>

      <p className="z-jar-help">Tap a token to place its letter. Tokens can be reused.</p>

      <div className="z-jar-tools">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onShuffle} disabled={disabled}>
          Shuffle
        </button>
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onPick('')}
          disabled={disabled}
        >
          Clear cell
        </button>
      </div>
    </section>
  )
}

function ZModeGame() {
  const { words } = useVocab()
  const { session } = useAuth()
  const userId = session?.user.id ?? 'guest'

  const puzzle = useMemo(() => createDailyPuzzle(words, userId), [words, userId])

  const fullJar = useMemo(() => buildFullJar(puzzle, puzzle.seed), [puzzle])

  const [phase, setPhase] = useState<Phase>('play')
  const [entries, setEntries] = useState<Record<string, string>>({})
  const [states, setStates] = useState(() => emptyStates(puzzle))
  const [activeClueId, setActiveClueId] = useState(puzzle.clues[0]?.id ?? '')
  const [selectedKey, setSelectedKey] = useState(() => {
    const first = puzzle.clues[0]
    if (!first) return '0:0'
    const open = first.cells.find((k) => {
      const cell = puzzle.cells.find((c) => c.key === k)
      return cell && !cell.seed
    })
    return open ?? first.cells[0]!
  })
  const [toast, setToast] = useState(
    'Tap tokens from the jar. Hint 1 culls · Hint 2 soft meaning · Reveal All zeros the board.',
  )
  const [best, setBest] = useState(() => loadBestScore(userId))
  const [visibleTokens, setVisibleTokens] = useState<JarToken[]>(fullJar)
  const [jarFiltered, setJarFiltered] = useState(false)
  const [shuffleTick, setShuffleTick] = useState(0)

  const cellByKey = useMemo(() => {
    const m = new Map<string, CrosswordCell>()
    for (const c of puzzle.cells) m.set(c.key, c)
    return m
  }, [puzzle])

  const activeClue = puzzle.clues.find((c) => c.id === activeClueId) ?? puzzle.clues[0]
  const activeState = activeClue ? states[activeClue.id] : undefined
  const score = useMemo(() => computeScore(puzzle, states), [puzzle, states])

  const restoreFullJar = useCallback(() => {
    setVisibleTokens(shuffleJarPositions(fullJar, `restore-${shuffleTick}`))
    setJarFiltered(false)
  }, [fullJar, shuffleTick])

  const finishIfComplete = useCallback(
    (nextEntries: Record<string, string>, nextStates: Record<string, ClueScoreState>) => {
      const updated = { ...nextStates }
      for (const clue of puzzle.clues) {
        if (updated[clue.id]?.revealed) {
          updated[clue.id] = { ...updated[clue.id], solved: true }
          continue
        }
        if (clueIsCorrect(clue, cellByKey, nextEntries)) {
          updated[clue.id] = { ...updated[clue.id], solved: true }
        }
      }

      const allSolved = puzzle.clues.every((c) => updated[c.id]?.solved)
      setStates(updated)
      if (allSolved) {
        const final = computeScore(puzzle, updated)
        saveBestScore(userId, final.earned)
        setBest((b) => Math.max(b, final.earned))
        setPhase('cleared')
        setToast(
          final.earned === final.max
            ? 'PERFECT CLEAR — clean jar run. Aura maxed.'
            : `Grid cleared · ${final.earned}/${final.max} pts`,
        )
        setVisibleTokens(fullJar)
        setJarFiltered(false)
      }
      return updated
    },
    [puzzle, cellByKey, userId, fullJar],
  )

  const revealClue = useCallback(
    (
      clue: CrosswordClue,
      nextEntries: Record<string, string>,
      nextStates: Record<string, ClueScoreState>,
      reason: string,
    ) => {
      const filled = { ...nextEntries }
      for (const key of clue.cells) {
        filled[key] = cellByKey.get(key)!.letter
      }
      const st = {
        ...nextStates,
        [clue.id]: { ...nextStates[clue.id], revealed: true, solved: true },
      }
      setEntries(filled)
      setToast(reason)
      finishIfComplete(filled, st)
      restoreFullJar()
    },
    [cellByKey, finishIfComplete, restoreFullJar],
  )

  const displayLetter = (cell: CrosswordCell) => {
    if (cell.seed) return cell.letter
    const clueIds = [cell.acrossId, cell.downId].filter(Boolean) as string[]
    if (clueIds.some((id) => states[id]?.revealed)) return cell.letter
    return (entries[cell.key] ?? '').toUpperCase()
  }

  const letterTone = (cell: CrosswordCell): 'seed' | 'ok' | 'bad' | 'empty' => {
    if (cell.seed) return 'seed'
    const clueIds = [cell.acrossId, cell.downId].filter(Boolean) as string[]
    if (clueIds.some((id) => states[id]?.revealed)) return 'ok'
    const typed = (entries[cell.key] ?? '').toUpperCase()
    if (!typed) return 'empty'
    return typed === cell.letter ? 'ok' : 'bad'
  }

  const selectCell = (cell: CrosswordCell, prefer?: 'across' | 'down') => {
    setSelectedKey(cell.key)
    const nextId =
      (prefer === 'down' && cell.downId) ||
      (prefer === 'across' && cell.acrossId) ||
      (activeClueId === cell.acrossId || activeClueId === cell.downId
        ? activeClueId
        : cell.acrossId || cell.downId || activeClueId)
    if (nextId && nextId !== activeClueId) {
      setActiveClueId(nextId)
      // Leaving a filtered jar when switching clues restores full jar
      if (jarFiltered) restoreFullJar()
    }
  }

  const advance = (fromKey: string, clue: CrosswordClue) => {
    const idx = clue.cells.indexOf(fromKey)
    for (let i = idx + 1; i < clue.cells.length; i++) {
      const cell = cellByKey.get(clue.cells[i]!)
      if (cell && !cell.seed && !states[clue.id]?.revealed) {
        setSelectedKey(cell.key)
        return
      }
    }
  }

  const afterPlace = (
    nextEntries: Record<string, string>,
    nextStates: Record<string, ClueScoreState>,
    clue: CrosswordClue,
  ) => {
    if (!clueFullyFilled(clue, cellByKey, nextEntries, Boolean(nextStates[clue.id]?.revealed))) {
      finishIfComplete(nextEntries, nextStates)
      return
    }

    if (clueIsCorrect(clue, cellByKey, nextEntries)) {
      setToast(`Word ${clue.number} ${clue.direction} locked in.`)
      finishIfComplete(nextEntries, nextStates)
      restoreFullJar()
      return
    }

    // Wrong full word after Hint1 engagement
    const st = nextStates[clue.id]!
    if (st.jarHintUses > 0) {
      const jarFails = st.jarFails + 1
      const updated = {
        ...nextStates,
        [clue.id]: { ...st, jarFails },
      }
      // 3 Hint1 uses exhausted OR 3 wrong completes while Hint1 was used → reveal
      if (st.jarHintUses >= HINT1_MAX_USES || jarFails >= HINT1_MAX_USES) {
        revealClue(
          clue,
          nextEntries,
          updated,
          `Out of jar chances on ${clue.number} ${clue.direction} — word revealed · 0 pts.`,
        )
        return
      }
      setStates(updated)
      setToast(
        `Not that word. Jar chances left: ${HINT1_MAX_USES - Math.max(st.jarHintUses, jarFails)}.`,
      )
      return
    }

    setToast('Not that word — try Hint 1 to cull the jar.')
    finishIfComplete(nextEntries, nextStates)
  }

  const placeLetter = (letter: string) => {
    if (phase !== 'play' || !activeClue) return
    const cell = cellByKey.get(selectedKey)
    if (!cell || cell.seed) return
    if (states[activeClue.id]?.revealed) return

    // Empty string = clear cell
    if (!letter) {
      const next = { ...entries }
      delete next[cell.key]
      setEntries(next)
      return
    }

    const L = letter.toUpperCase()
    const next = { ...entries, [cell.key]: L }
    setEntries(next)
    afterPlace(next, states, activeClue)
    advance(cell.key, activeClue)
  }

  const useHint1 = () => {
    if (!activeClue || phase !== 'play') return
    const st = states[activeClue.id] ?? emptyClueState()
    if (st.revealed || st.solved) return

    if (st.jarHintUses >= HINT1_MAX_USES) {
      setToast('No Hint 1 uses left on this word — one wrong fill reveals it.')
      return
    }

    const target = hint1Target(activeClue, cellByKey, entries)
    const culled = cullJarForHint1(fullJar, target, `${activeClue.id}-${st.jarHintUses + 1}`)
    setVisibleTokens(culled)
    setJarFiltered(true)

    const jarHintUses = st.jarHintUses + 1
    setStates((prev) => ({
      ...prev,
      [activeClue.id]: { ...prev[activeClue.id], jarHintUses },
    }))

    const left = HINT1_MAX_USES - jarHintUses
    setToast(
      left > 0
        ? `Hint 1 · jar culled to ${culled.length} (−${JAR_HINT_PENALTY} pts). ${left} cull${left === 1 ? '' : 's'} left.`
        : `Hint 1 · final cull (−${JAR_HINT_PENALTY} pts). Nail it or a wrong fill reveals the word.`,
    )
  }

  const useHint2 = () => {
    if (!activeClue || phase !== 'play') return
    const st = states[activeClue.id] ?? emptyClueState()
    if (st.meaningHinted) {
      setToast('Soft meaning already open for this word.')
      return
    }
    if (st.revealed || st.solved) return
    setStates((prev) => ({
      ...prev,
      [activeClue.id]: { ...prev[activeClue.id], meaningHinted: true },
    }))
    setToast(`Hint 2 · soft meaning (−${MEANING_HINT_PENALTY} pts).`)
  }

  const revealAll = () => {
    if (phase !== 'play') return
    const nextEntries = { ...entries }
    for (const cell of puzzle.cells) nextEntries[cell.key] = cell.letter
    setEntries(nextEntries)
    const nextStates = { ...states }
    for (const clue of puzzle.clues) {
      nextStates[clue.id] = { ...nextStates[clue.id], revealed: true, solved: true }
    }
    setToast('Reveal All — no points added for revealed words.')
    finishIfComplete(nextEntries, nextStates)
  }

  const resetBoard = () => {
    setEntries({})
    setStates(emptyStates(puzzle))
    setActiveClueId(puzzle.clues[0]?.id ?? '')
    setSelectedKey(puzzle.clues[0]?.cells[0] ?? '0:0')
    setPhase('play')
    setVisibleTokens(shuffleJarPositions(fullJar, 'reset'))
    setJarFiltered(false)
    setToast('Fresh try. Same daily grid. Chase a cleaner score.')
  }

  useEffect(() => {
    setVisibleTokens(fullJar)
  }, [fullJar])

  const rows = puzzle.size
  const cols = puzzle.size
  const gridCells: Array<CrosswordCell | null> = []
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      gridCells.push(cellByKey.get(`${r}:${c}`) ?? null)
    }
  }

  const jarChancesLeft = activeState
    ? Math.max(0, HINT1_MAX_USES - Math.max(activeState.jarHintUses, activeState.jarFails))
    : HINT1_MAX_USES

  return (
    <div className="zmode">
      <header className="z-top">
        <div>
          <p className="eyebrow z-eyebrow">Z-MODE · LETTER JAR</p>
          <h1 className="z-title">
            Crossword <span className="highlight">unlocked</span>
          </h1>
        </div>
        <Link to="/" className="btn btn-ghost btn-sm">
          Exit
        </Link>
      </header>

      <div className="z-scorebar" aria-live="polite">
        <div className="z-score-pill">
          <span className="z-score-label">Score</span>
          <strong>
            {score.earned}
            <span className="z-score-max">/{score.max}</span>
          </strong>
        </div>
        <div className="z-score-pill">
          <span className="z-score-label">Best today</span>
          <strong>{Math.max(best, score.earned)}</strong>
        </div>
        <div className="z-score-pill">
          <span className="z-score-label">Jar hints</span>
          <strong>{score.jarHintsUsed}</strong>
        </div>
        <div className="z-score-pill">
          <span className="z-score-label">Reveals</span>
          <strong>{score.revealsUsed}</strong>
        </div>
      </div>

      {toast && (
        <p className="z-toast" role="status">
          {toast}
        </p>
      )}

      {phase === 'cleared' && (
        <div className="z-cleared">
          <h2>Grid cleared</h2>
          <p>
            You scored <strong>{score.earned}</strong> of {score.max}. Hint 1 −{JAR_HINT_PENALTY} each ·
            Hint 2 −{MEANING_HINT_PENALTY} · revealed words score 0.
          </p>
          <div className="cta-row">
            <button type="button" className="btn btn-primary" onClick={resetBoard}>
              Rematch
            </button>
            <Link to="/" className="btn btn-ghost">
              Back home
            </Link>
          </div>
        </div>
      )}

      <div className="z-stage z-stage-jar">
        <div className="z-board-wrap">
          <div
            className="z-board"
            style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}
            role="grid"
            aria-label="Crossword board"
          >
            {gridCells.map((cell, i) => {
              if (!cell) {
                return <div key={`b-${i}`} className="z-cell z-cell-block" aria-hidden />
              }
              const selected = selectedKey === cell.key
              const inActive =
                cell.acrossId === activeClueId || cell.downId === activeClueId
              const tone = letterTone(cell)
              return (
                <button
                  key={cell.key}
                  type="button"
                  role="gridcell"
                  className={[
                    'z-cell',
                    selected ? 'is-selected' : '',
                    inActive ? 'is-active' : '',
                    `is-${tone}`,
                    cell.seed ? 'is-seed' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => {
                    if (selected && cell.acrossId && cell.downId) {
                      const flip = activeClue?.direction === 'across' ? 'down' : 'across'
                      selectCell(cell, flip)
                    } else {
                      selectCell(cell)
                    }
                  }}
                >
                  {cell.number != null && <span className="z-cell-num">{cell.number}</span>}
                  <span className="z-cell-letter">{displayLetter(cell)}</span>
                </button>
              )
            })}
          </div>

          {activeClue && (
            <p className="z-active-meta">
              Playing <strong>{activeClue.number} {activeClue.direction}</strong> ·{' '}
              {activeClue.answer.length} letters · jar chances {jarChancesLeft}/{HINT1_MAX_USES}
            </p>
          )}
        </div>

        <aside className="z-side">
          <LetterJar
            tokens={visibleTokens}
            filtered={jarFiltered}
            disabled={phase !== 'play'}
            onPick={placeLetter}
            onShuffle={() => {
              setShuffleTick((n) => n + 1)
              setVisibleTokens((prev) => shuffleJarPositions(prev, `fun-${shuffleTick + 1}`))
              setToast('Jar shuffled — same letters, new chaos.')
            }}
          />

          <section className="z-hintbar">
            {activeState?.meaningHinted && activeClue ? (
              <p className="z-hint-body">{activeClue.softHint}</p>
            ) : null}
            <div className="z-hintbar-actions">
              <button
                type="button"
                className="btn btn-primary btn-sm"
                onClick={useHint1}
                disabled={
                  phase !== 'play' ||
                  !activeClue ||
                  Boolean(activeState?.revealed || activeState?.solved) ||
                  (activeState?.jarHintUses ?? 0) >= HINT1_MAX_USES
                }
              >
                Hint 1
              </button>
              <button
                type="button"
                className="btn btn-ghost btn-sm"
                onClick={useHint2}
                disabled={
                  phase !== 'play' ||
                  !activeClue ||
                  Boolean(activeState?.meaningHinted || activeState?.revealed || activeState?.solved)
                }
              >
                Hint 2
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={revealAll}
                disabled={phase !== 'play'}
              >
                Reveal all
              </button>
            </div>
            <p className="z-rules">
              Hint 1 −{JAR_HINT_PENALTY} · Hint 2 −{MEANING_HINT_PENALTY} · Reveal = 0 pts
            </p>
          </section>
        </aside>
      </div>
    </div>
  )
}

export default function ZMode() {
  return <ZModeGame />
}
