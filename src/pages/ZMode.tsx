import { useEffect, useMemo, useState, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth'
import { useVocab } from '../hooks/useVocab'
import type { CrosswordCell, CrosswordClue, CrosswordPuzzle } from '../lib/crossword'
import { buildLetterWheel, shuffleWheel } from '../lib/letterWheel'
import { LetterWheel } from './LetterWheel'
import {
  computeScore,
  createDailyPuzzle,
  emptyClueState,
  loadBestScore,
  MEANING_HINT_PENALTY,
  RIDDLE_HINT_PENALTY,
  riddleForClue,
  saveBestScore,
  type ClueScoreState,
} from '../lib/zmode'
import './zmode.css'

function emptyStates(puzzle: CrosswordPuzzle): Record<string, ClueScoreState> {
  return Object.fromEntries(puzzle.clues.map((clue) => [clue.id, emptyClueState()]))
}

function ZModeGame({ puzzle, userId }: { puzzle: CrosswordPuzzle; userId: string }) {
  const cellByKey = useMemo(() => new Map(puzzle.cells.map((cell) => [cell.key, cell])), [puzzle])
  const { gridCells, columns, rows } = useMemo(() => {
    const minRow = Math.min(...puzzle.cells.map((cell) => cell.row))
    const minCol = Math.min(...puzzle.cells.map((cell) => cell.col))
    const rows = Math.max(...puzzle.cells.map((cell) => cell.row)) - minRow + 1
    const columns = Math.max(...puzzle.cells.map((cell) => cell.col)) - minCol + 1
    const gridCells = Array.from({ length: rows * columns }, (_, index) => {
      const row = minRow + Math.floor(index / columns)
      const col = minCol + index % columns
      return cellByKey.get(`${row}:${col}`)
    })
    return { gridCells, columns, rows }
  }, [cellByKey, puzzle.cells])
  const firstEditable = (clue: CrosswordClue | undefined) =>
    clue?.cells.find((key) => !cellByKey.get(key)?.seed) ?? clue?.cells[0] ?? ''

  const initialBoard = () => ({
    entries: {} as Record<string, string>,
    states: emptyStates(puzzle),
    activeClueId: puzzle.clues[0]?.id ?? '',
    selectedKey: firstEditable(puzzle.clues[0]),
    feedback: '',
  })
  const [board, setBoard] = useState(initialBoard)
  const { entries, states, activeClueId, selectedKey, feedback } = board
  const [best, setBest] = useState(() => loadBestScore(userId))
  const [wheelOverrides, setWheelOverrides] = useState<Record<string, string[]>>({})
  const [hintClueId, setHintClueId] = useState<string | null>(null)
  const [confirmReveal, setConfirmReveal] = useState(false)

  const activeClue = puzzle.clues.find((clue) => clue.id === activeClueId)
  const hintOpen = hintClueId === activeClueId
  const activeState = activeClue ? states[activeClue.id] : undefined
  const cleared = puzzle.clues.every((clue) => states[clue.id]?.solved)
  const score = useMemo(() => computeScore(puzzle, states), [puzzle, states])
  const isLocked = (cell: CrosswordCell, clueStates = states) =>
    cell.seed || Boolean((cell.acrossId && clueStates[cell.acrossId]?.solved) ||
      (cell.downId && clueStates[cell.downId]?.solved))
  const wheelLetters = activeClue
    ? wheelOverrides[activeClue.id] ?? buildLetterWheel(activeClue.answer, `${puzzle.seed}:${activeClue.id}`)
    : []

  useEffect(() => {
    if (!cleared) return
    saveBestScore(userId, score.earned)
    setBest((previous) => Math.max(previous, score.earned))
  }, [cleared, score.earned, userId])

  function selectCell(cell: CrosswordCell) {
    const crossing = cell.key === selectedKey && cell.acrossId && cell.downId
    const currentFits = activeClueId === cell.acrossId || activeClueId === cell.downId
    const nextId = crossing
      ? activeClueId === cell.acrossId ? cell.downId : cell.acrossId
      : currentFits ? activeClueId : cell.acrossId ?? cell.downId
    setBoard((current) => ({
      ...current,
      selectedKey: cell.key,
      activeClueId: nextId ?? current.activeClueId,
      feedback: '',
    }))
    if (nextId !== activeClueId) {
      setHintClueId(null)
      setConfirmReveal(false)
    }
  }

  function submitWord(word: string) {
    if (!activeClue || activeState?.solved || cleared) return
    const clue = activeClue
    setBoard((current) => {
      if (current.activeClueId !== clue.id || current.states[clue.id]?.solved) return current
      if (word !== clue.answer) {
        const feedback = word.length === clue.answer.length
          ? 'Try another word.'
          : `Use ${clue.answer.length} letters.`
        return { ...current, feedback }
      }

      const entries = { ...current.entries }
      clue.cells.forEach((key, index) => { entries[key] = word[index] })
      const states = { ...current.states }
      for (const candidate of puzzle.clues) {
        if (!states[candidate.id]?.solved && candidate.cells.every((key) => {
          const cell = cellByKey.get(key)!
          return cell.seed || entries[key] === cell.letter
        })) {
          states[candidate.id] = { ...states[candidate.id], solved: true }
        }
      }

      const nextClue = puzzle.clues.find((candidate) => !states[candidate.id]?.solved)
      const openCell = nextClue?.cells.find((key) => !isLocked(cellByKey.get(key)!, states))
      return {
        entries,
        states,
        activeClueId: nextClue?.id ?? clue.id,
        selectedKey: openCell ?? nextClue?.cells[0] ?? current.selectedKey,
        feedback: '',
      }
    })
  }

  function unlockHint(kind: 'riddleHinted' | 'meaningHinted') {
    if (!activeClue || !activeState || activeState.solved || activeState[kind]) return
    setBoard((current) => ({
      ...current,
      states: { ...current.states, [activeClue.id]: { ...current.states[activeClue.id], [kind]: true } },
    }))
  }

  function revealAll() {
    const filled = Object.fromEntries(puzzle.cells.map((cell) => [cell.key, cell.letter]))
    const updated = Object.fromEntries(puzzle.clues.map((clue) => {
      const state = states[clue.id]
      return [clue.id, { ...state, revealed: true, solved: true }]
    }))
    setBoard((current) => ({ ...current, entries: filled, states: updated, feedback: '' }))
    setHintClueId(null)
    setConfirmReveal(false)
  }

  function resetBoard() {
    setBoard(initialBoard())
    setWheelOverrides({})
    setHintClueId(null)
    setConfirmReveal(false)
  }

  return (
    <div className="zmode">
      <header className="z-top">
        <div>
          <p className="eyebrow z-eyebrow">Z-mode · Daily grid</p>
          <h1 className="z-title">Daily <span className="highlight">crossword</span></h1>
        </div>
        <Link to="/" className="btn btn-ghost btn-sm">Exit</Link>
      </header>

      <div className="z-stage">
        <div className="z-board-wrap">
          <div className="z-board"
            style={{
              gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
              '--z-board-ratio': columns / rows,
            } as CSSProperties}
            role="group" aria-label="Crossword board">
            {gridCells.map((cell, index) => {
              if (!cell) return <div key={index} className="z-cell z-cell-block" aria-hidden="true" />
              const letter = cell.seed ? cell.letter : entries[cell.key] ?? ''
              const selected = !cleared && selectedKey === cell.key
              const active = !cleared && activeClue?.cells.includes(cell.key)
              const tone = cell.seed ? 'seed' : letter ? 'solved' : 'empty'
              return (
                <button key={cell.key} type="button"
                  className={`z-cell is-${tone}${selected ? ' is-selected' : ''}${active ? ' is-active' : ''}`}
                  onClick={() => selectCell(cell)} disabled={cleared} aria-pressed={selected}
                  aria-label={`Row ${cell.row + 1}, column ${cell.col + 1}, ${letter || 'blank'}${isLocked(cell) ? ', fixed' : ''}`}>
                  {cell.number != null && <span className="z-cell-num">{cell.number}</span>}
                  <span className="z-cell-letter">{letter}</span>
                </button>
              )
            })}
          </div>

          {!cleared && activeClue && (
            <div className="z-clue">
              <div className="z-clue-row">
                <p><strong>{activeClue.number} {activeClue.direction}</strong> · {activeClue.answer.length} letters</p>
                <p className="z-feedback" role="status">{feedback}</p>
                <button type="button" className="z-quiet-action" aria-expanded={hintOpen}
                  aria-controls="z-help" onClick={() => {
                    setHintClueId(hintOpen ? null : activeClueId)
                    setConfirmReveal(false)
                  }}>Hint</button>
              </div>
              <div id="z-help" className="z-help" hidden={!hintOpen}>
                <div className="z-help-actions">
                  <button type="button" className="btn btn-ghost btn-sm"
                    disabled={activeState?.solved || activeState?.riddleHinted}
                    onClick={() => unlockHint('riddleHinted')}>Riddle · −{RIDDLE_HINT_PENALTY}</button>
                  <button type="button" className="btn btn-ghost btn-sm"
                    disabled={activeState?.solved || activeState?.meaningHinted}
                    onClick={() => unlockHint('meaningHinted')}>Meaning · −{MEANING_HINT_PENALTY}</button>
                </div>
                <div aria-live="polite">
                  {activeState?.riddleHinted && <p className="z-help-copy"><strong>Riddle</strong>{riddleForClue(activeClue)}</p>}
                  {activeState?.meaningHinted && <p className="z-help-copy"><strong>Meaning</strong>{activeClue.softHint}</p>}
                </div>
                {confirmReveal ? (
                  <div className="z-reveal-confirm">
                    <p>Reveal the grid? This run will score zero.</p>
                    <div className="z-help-actions">
                      <button type="button" className="z-quiet-action" onClick={() => setConfirmReveal(false)}>Cancel</button>
                      <button type="button" className="z-quiet-action" onClick={revealAll}>Reveal grid</button>
                    </div>
                  </div>
                ) : (
                  <button type="button" className="z-quiet-action z-reveal" onClick={() => setConfirmReveal(true)}>Reveal grid</button>
                )}
              </div>
            </div>
          )}
        </div>

        {cleared ? (
          <section className="z-cleared" aria-labelledby="z-recap-title">
            <h2 id="z-recap-title">{score.revealsUsed ? 'Grid revealed' : 'Grid cleared'}</h2>
            <p className="z-recap-score"><strong>{score.earned}</strong> / {score.max} points</p>
            <dl className="z-recap-stats">
              <div><dt>Best today</dt><dd>{best}</dd></div>
              <div><dt>Hints used</dt><dd>{score.riddleHintsUsed + score.meaningHintsUsed}</dd></div>
              <div><dt>Reveals</dt><dd>{score.revealsUsed}</dd></div>
            </dl>
            <button type="button" className="btn btn-primary btn-sm" onClick={resetBoard}>Play again</button>
          </section>
        ) : activeClue ? (
          <LetterWheel key={activeClue.id} letters={wheelLetters} answerLength={activeClue.answer.length}
            disabled={Boolean(activeState?.solved)} onSubmit={submitWord}
            onShuffle={() => setWheelOverrides((previous) => ({
              ...previous,
              [activeClue.id]: shuffleWheel(wheelLetters),
            }))} />
        ) : null}
      </div>
    </div>
  )
}

export default function ZMode() {
  const { words } = useVocab()
  const { session } = useAuth()
  const userId = session?.user.id ?? 'guest'
  const puzzle = useMemo(() => createDailyPuzzle(words, userId), [words, userId])
  const puzzleKey = [puzzle.seed, ...puzzle.clues.map((clue) => clue.id)].join(':')
  return <ZModeGame key={puzzleKey} puzzle={puzzle} userId={userId} />
}
