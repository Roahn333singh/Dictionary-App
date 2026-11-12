import type { CrosswordCell, CrosswordClue, CrosswordPuzzle } from './crossword'

export const TOKEN_COUNT = 21
export const TOKENS_PER_COLOR = 7
export const HINT1_EXTRA = 5
export const HINT1_MAX_USES = 3

export type TokenColor = 'violet' | 'gold' | 'peach'

export type JarToken = {
  id: string
  letter: string
  color: TokenColor
  /** Mild tilt only — layout is a CSS grid so letters stay readable. */
  rot: number
}

export const TOKEN_COLORS: TokenColor[] = ['violet', 'gold', 'peach']

function mulberry32(a: number) {
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function hashSeed(seed: string): number {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

function shuffleInPlace<T>(arr: T[], rand: () => number) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[arr[i], arr[j]] = [arr[j], arr[i]]
  }
  return arr
}

function paintColors(letters: string[], rand: () => number): JarToken[] {
  const colors: TokenColor[] = []
  for (const color of TOKEN_COLORS) {
    for (let i = 0; i < TOKENS_PER_COLOR; i++) colors.push(color)
  }
  shuffleInPlace(colors, rand)
  return letters.map((letter, i) => ({
    id: `t${i}-${letter}`,
    letter,
    color: colors[i] ?? 'violet',
    rot: (rand() - 0.5) * 14,
  }))
}

/** Letters the player still needs to type (non-seed cells). */
export function neededLettersForPuzzle(puzzle: CrosswordPuzzle): string[] {
  const letters: string[] = []
  for (const cell of puzzle.cells) {
    if (!cell.seed) letters.push(cell.letter)
  }
  return letters
}

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('')

/**
 * Build the full 21-token jar.
 * Guarantees every non-seed crossword letter appears at least once.
 * Remaining slots are decoys. Colors are always 7 / 7 / 7.
 */
export function buildFullJar(puzzle: CrosswordPuzzle, seed: string): JarToken[] {
  const rand = mulberry32(hashSeed(`jar:${seed}`))
  const needed = neededLettersForPuzzle(puzzle)
  const letters: string[] = []

  // Prefer multiplicity from the grid first (covers repeats)
  for (const L of needed) {
    if (letters.length >= TOKEN_COUNT) break
    letters.push(L)
  }

  // If grid needs fewer than 21, pad with decoys (any A–Z)
  while (letters.length < TOKEN_COUNT) {
    letters.push(ALPHABET[Math.floor(rand() * 26)]!)
  }

  // If somehow over (huge grid), keep a multiset covering unique needed + fill
  if (needed.length > TOKEN_COUNT) {
    const unique = [...new Set(needed)]
    const trimmed = unique.slice(0, TOKEN_COUNT)
    while (trimmed.length < TOKEN_COUNT) {
      trimmed.push(needed[trimmed.length % needed.length]!)
    }
    shuffleInPlace(trimmed, rand)
    return paintColors(trimmed, rand)
  }

  shuffleInPlace(letters, rand)
  return paintColors(letters.slice(0, TOKEN_COUNT), rand)
}

export function shuffleJarPositions(tokens: JarToken[], salt: string): JarToken[] {
  const rand = mulberry32(hashSeed(`shuffle:${salt}:${Date.now()}`))
  const next = [...tokens]
  shuffleInPlace(next, rand)
  return next.map((token, i) => ({
    ...token,
    rot: (rand() - 0.5) * 16,
    id: `${token.letter}-${salt}-${i}`,
  }))
}

export type Hint1Target = {
  /** Letters still required for empty (non-seed, not correctly filled) cells. */
  needed: string[]
  /** Pre-filled / seed letters on this clue — must NOT appear in the culled jar. */
  banned: string[]
  targetCount: number
}

export function hint1Target(
  clue: CrosswordClue,
  cellByKey: Map<string, CrosswordCell>,
  entries: Record<string, string>,
): Hint1Target {
  const needed: string[] = []
  const banned = new Set<string>()

  for (const key of clue.cells) {
    const cell = cellByKey.get(key)
    if (!cell) continue
    if (cell.seed) {
      banned.add(cell.letter)
      continue
    }
    const typed = (entries[key] ?? '').toUpperCase()
    if (typed === cell.letter) {
      // Already correct — treat like filled; don't require that letter again
      continue
    }
    needed.push(cell.letter)
  }

  // Ban seed letters from decoys too (user rule: must not contain pre-filled letters)
  for (const key of clue.cells) {
    const cell = cellByKey.get(key)
    if (cell?.seed) banned.add(cell.letter)
  }

  const targetCount = Math.max(clue.answer.length + HINT1_EXTRA, needed.length)
  return { needed, banned: [...banned], targetCount }
}

/**
 * Cull jar to targetCount tokens for Hint1.
 * Must include every still-needed letter; must exclude banned (pre-filled) letters.
 */
export function cullJarForHint1(
  _fullJar: JarToken[],
  target: Hint1Target,
  seed: string,
): JarToken[] {
  void _fullJar
  const rand = mulberry32(hashSeed(`hint1:${seed}:${target.needed.join('')}`))
  const banned = new Set(target.banned)
  const picked: string[] = [...target.needed]

  const decoyPool = ALPHABET.filter((L) => !banned.has(L))
  // Prefer decoys that aren't already saturating needed duplicates too hard
  while (picked.length < target.targetCount) {
    const L = decoyPool[Math.floor(rand() * decoyPool.length)] ?? 'X'
    picked.push(L)
  }

  // Never exceed targetCount but never drop needed
  const letters = picked.slice(0, Math.max(target.targetCount, target.needed.length))
  shuffleInPlace(letters, rand)

  const colorCycle: TokenColor[] = ['violet', 'gold', 'peach']
  return letters.map((letter, i) => ({
    id: `h1-${i}-${letter}-${seed}`,
    letter,
    color: colorCycle[i % 3]!,
    rot: (rand() - 0.5) * 12,
  }))
}

export function clueFullyFilled(
  clue: CrosswordClue,
  cellByKey: Map<string, CrosswordCell>,
  entries: Record<string, string>,
  revealed: boolean,
): boolean {
  if (revealed) return true
  return clue.cells.every((key) => {
    const cell = cellByKey.get(key)!
    if (cell.seed) return true
    return Boolean((entries[key] ?? '').toUpperCase())
  })
}

export function clueIsCorrect(
  clue: CrosswordClue,
  cellByKey: Map<string, CrosswordCell>,
  entries: Record<string, string>,
): boolean {
  return clue.cells.every((key) => {
    const cell = cellByKey.get(key)!
    if (cell.seed) return true
    return (entries[key] ?? '').toUpperCase() === cell.letter
  })
}
