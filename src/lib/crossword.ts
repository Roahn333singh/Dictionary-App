/** Lightweight crossword builder for Z-mode. No network, no heavy deps. */

export type CrosswordWord = {
  word: string
  meaning: string
  softHint: string
}

export type CrosswordClue = {
  id: string
  number: number
  direction: 'across' | 'down'
  answer: string
  meaning: string
  softHint: string
  row: number
  col: number
  /** Absolute cell keys "r:c" in order */
  cells: string[]
}

export type CrosswordCell = {
  key: string
  row: number
  col: number
  letter: string
  acrossId?: string
  downId?: string
  /** Pre-filled anchor letter (usually a middle letter) */
  seed: boolean
  number?: number
}

export type CrosswordPuzzle = {
  size: number
  cells: CrosswordCell[]
  clues: CrosswordClue[]
  seed: string
}

const MIN_LEN = 3
const MAX_LEN = 8
const MAX_WORDS = 6
const MAX_SIZE = 11

function cellKey(row: number, col: number) {
  return `${row}:${col}`
}

function normalizeWord(raw: string): string | null {
  const word = raw.trim().toUpperCase().replace(/[^A-Z]/g, '')
  if (word.length < MIN_LEN || word.length > MAX_LEN) return null
  return word
}

export function softHintFromMeaning(word: string, meaning: string): string {
  const cleaned = meaning
    .replace(new RegExp(word, 'ig'), '…')
    .replace(/\s+/g, ' ')
    .trim()
  if (!cleaned) return 'A word from your Retain dictionary — trust the vibe.'
  const clipped = cleaned.length > 90 ? `${cleaned.slice(0, 87)}…` : cleaned
  return `Think: ${clipped}`
}

type Placed = {
  word: string
  meaning: string
  softHint: string
  row: number
  col: number
  direction: 'across' | 'down'
}

function canPlace(
  grid: Map<string, string>,
  word: string,
  row: number,
  col: number,
  direction: 'across' | 'down',
): boolean {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i
    const c = direction === 'across' ? col + i : col
    if (r < 0 || c < 0 || r >= MAX_SIZE || c >= MAX_SIZE) return false
    const existing = grid.get(cellKey(r, c))
    if (existing && existing !== word[i]) return false
  }

  // Ends should not butt into an existing letter in the same run direction.
  if (direction === 'across') {
    if (grid.has(cellKey(row, col - 1)) || grid.has(cellKey(row, col + word.length))) return false
  } else if (grid.has(cellKey(row - 1, col)) || grid.has(cellKey(row + word.length, col))) {
    return false
  }

  // Light adjacency: empty cells may not sit flush beside a foreign letter
  // on the perpendicular axis (keeps the board crossword-shaped).
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i
    const c = direction === 'across' ? col + i : col
    const existing = grid.get(cellKey(r, c))
    if (existing) continue
    if (direction === 'across') {
      if (grid.has(cellKey(r - 1, c)) || grid.has(cellKey(r + 1, c))) return false
    } else if (grid.has(cellKey(r, c - 1)) || grid.has(cellKey(r, c + 1))) {
      return false
    }
  }

  return true
}

function placeWord(
  grid: Map<string, string>,
  word: string,
  row: number,
  col: number,
  direction: 'across' | 'down',
) {
  for (let i = 0; i < word.length; i++) {
    const r = direction === 'across' ? row : row + i
    const c = direction === 'across' ? col + i : col
    grid.set(cellKey(r, c), word[i])
  }
}

function findPlacements(grid: Map<string, string>, word: string): Array<{
  row: number
  col: number
  direction: 'across' | 'down'
  crosses: number
}> {
  const options: Array<{ row: number; col: number; direction: 'across' | 'down'; crosses: number }> = []
  if (grid.size === 0) {
    options.push({ row: 0, col: 0, direction: 'across', crosses: 0 })
    return options
  }

  const letters = [...grid.entries()]
  for (let wi = 0; wi < word.length; wi++) {
    for (const [key, letter] of letters) {
      if (letter !== word[wi]) continue
      const [gr, gc] = key.split(':').map(Number)
      // place as across so word[wi] lands on (gr, gc)
      {
        const row = gr
        const col = gc - wi
        if (canPlace(grid, word, row, col, 'across')) {
          let crosses = 0
          for (let i = 0; i < word.length; i++) {
            if (grid.has(cellKey(row, col + i))) crosses++
          }
          if (crosses > 0) options.push({ row, col, direction: 'across', crosses })
        }
      }
      // place as down
      {
        const row = gr - wi
        const col = gc
        if (canPlace(grid, word, row, col, 'down')) {
          let crosses = 0
          for (let i = 0; i < word.length; i++) {
            if (grid.has(cellKey(row + i, col))) crosses++
          }
          if (crosses > 0) options.push({ row, col, direction: 'down', crosses })
        }
      }
    }
  }

  options.sort((a, b) => b.crosses - a.crosses)
  return options
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function pickBestWords(pool: CrosswordWord[], seed: string): CrosswordWord[] {
  const rand = mulberry32(hashSeed(seed))
  const unique = new Map<string, CrosswordWord>()
  for (const item of pool) {
    const word = normalizeWord(item.word)
    if (!word) continue
    if (!unique.has(word)) {
      unique.set(word, {
        word,
        meaning: item.meaning || 'A word worth keeping.',
        softHint: item.softHint || softHintFromMeaning(word, item.meaning || ''),
      })
    }
  }
  const list = [...unique.values()]
  // Prefer mid-length words for nicer grids
  list.sort((a, b) => {
    const score = (w: string) => Math.abs(w.length - 5) + rand() * 0.3
    return score(a.word) - score(b.word)
  })
  return list.slice(0, Math.min(MAX_WORDS + 4, list.length))
}

export function buildCrossword(pool: CrosswordWord[], seed: string): CrosswordPuzzle | null {
  const candidates = pickBestWords(pool, seed)
  if (candidates.length < 2) return null

  const rand = mulberry32(hashSeed(`${seed}:place`))
  const grid = new Map<string, string>()
  const placed: Placed[] = []

  // First word across near origin
  const first = candidates[0]
  placeWord(grid, first.word, 0, 0, 'across')
  placed.push({
    word: first.word,
    meaning: first.meaning,
    softHint: first.softHint,
    row: 0,
    col: 0,
    direction: 'across',
  })

  for (let i = 1; i < candidates.length && placed.length < MAX_WORDS; i++) {
    const item = candidates[i]
    const options = findPlacements(grid, item.word)
    if (!options.length) continue
    // Prefer stronger crosses; small random among top few
    const top = options.slice(0, Math.min(4, options.length))
    const choice = top[Math.floor(rand() * top.length)]
    placeWord(grid, item.word, choice.row, choice.col, choice.direction)
    placed.push({
      word: item.word,
      meaning: item.meaning,
      softHint: item.softHint,
      row: choice.row,
      col: choice.col,
      direction: choice.direction,
    })
  }

  if (placed.length < 2) return null

  // Normalize to non-negative coords
  let minR = Infinity
  let minC = Infinity
  let maxR = -Infinity
  let maxC = -Infinity
  for (const key of grid.keys()) {
    const [r, c] = key.split(':').map(Number)
    minR = Math.min(minR, r)
    minC = Math.min(minC, c)
    maxR = Math.max(maxR, r)
    maxC = Math.max(maxC, c)
  }

  const height = maxR - minR + 1
  const width = maxC - minC + 1
  const size = Math.max(height, width)

  const shifted = placed.map((p) => ({
    ...p,
    row: p.row - minR,
    col: p.col - minC,
  }))

  const letterAt = new Map<string, string>()
  for (const p of shifted) {
    for (let i = 0; i < p.word.length; i++) {
      const r = p.direction === 'across' ? p.row : p.row + i
      const c = p.direction === 'across' ? p.col + i : p.col
      letterAt.set(cellKey(r, c), p.word[i])
    }
  }

  // Numbering: sort by row then col of start cells
  const starts = shifted
    .map((p, idx) => ({ ...p, idx }))
    .sort((a, b) => a.row - b.row || a.col - b.col)

  const numberByStart = new Map<string, number>()
  let n = 1
  for (const p of starts) {
    const k = cellKey(p.row, p.col)
    if (!numberByStart.has(k)) {
      numberByStart.set(k, n)
      n += 1
    }
  }

  const clues: CrosswordClue[] = starts.map((p) => {
    const cells: string[] = []
    for (let i = 0; i < p.word.length; i++) {
      const r = p.direction === 'across' ? p.row : p.row + i
      const c = p.direction === 'across' ? p.col + i : p.col
      cells.push(cellKey(r, c))
    }
    return {
      id: `${p.direction[0]}${numberByStart.get(cellKey(p.row, p.col))}-${p.word}`,
      number: numberByStart.get(cellKey(p.row, p.col))!,
      direction: p.direction,
      answer: p.word,
      meaning: p.meaning,
      softHint: p.softHint,
      row: p.row,
      col: p.col,
      cells,
    }
  })

  // Seed middle letters (and a few extras if short)
  const seedKeys = new Set<string>()
  for (const clue of clues) {
    const mid = Math.floor(clue.cells.length / 2)
    seedKeys.add(clue.cells[mid])
  }

  const cellMap = new Map<string, CrosswordCell>()
  for (const [key, letter] of letterAt) {
    const [row, col] = key.split(':').map(Number)
    cellMap.set(key, {
      key,
      row,
      col,
      letter,
      seed: seedKeys.has(key),
      number: numberByStart.get(key),
    })
  }

  for (const clue of clues) {
    for (const key of clue.cells) {
      const cell = cellMap.get(key)
      if (!cell) continue
      if (clue.direction === 'across') cell.acrossId = clue.id
      else cell.downId = clue.id
    }
  }

  const cells = [...cellMap.values()].sort((a, b) => a.row - b.row || a.col - b.col)

  return { size, cells, clues, seed }
}

export function cluePoints(answer: string): number {
  // Longer words pay more; keeps scoring readable (tens/hundreds).
  return 40 + answer.length * 20
}

export const HINT_PENALTY = 25
