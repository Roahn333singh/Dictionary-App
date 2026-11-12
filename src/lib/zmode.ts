import {
  buildCrossword,
  cluePoints,
  softHintFromMeaning,
  type CrosswordClue,
  type CrosswordPuzzle,
  type CrosswordWord,
} from './crossword'
import type { VocabWord } from '../types'
import { todayKey } from './wotd'

/** Fallback pack when the user has too few dictionary words. */
export const ZMODE_FALLBACK: CrosswordWord[] = [
  {
    word: 'FOCUS',
    meaning: 'The center of attention or activity.',
    softHint: 'Think: where your attention locks in.',
  },
  {
    word: 'GRIT',
    meaning: 'Courage and resolve; tough perseverance.',
    softHint: 'Think: hard work that refuses to quit.',
  },
  {
    word: 'FLAIR',
    meaning: 'A natural stylish talent or knack.',
    softHint: 'Think: style that feels effortless.',
  },
  {
    word: 'CURE',
    meaning: 'A remedy that fixes a problem.',
    softHint: 'Think: what ends the problem.',
  },
  {
    word: 'OPEN',
    meaning: 'Receptive; not closed off.',
    softHint: 'Think: opposite of guarded.',
  },
  {
    word: 'TONE',
    meaning: 'The quality or character of a voice or mood.',
    softHint: 'Think: how something sounds or feels.',
  },
  {
    word: 'BOLD',
    meaning: 'Confident and courageous; striking.',
    softHint: 'Think: not shy — loud on purpose.',
  },
  {
    word: 'QUICK',
    meaning: 'Moving fast; happening with little delay.',
    softHint: 'Think: speed without the drama.',
  },
  {
    word: 'FREE',
    meaning: 'Not under control; unrestricted.',
    softHint: 'Think: meaning freedom.',
  },
  {
    word: 'NOSY',
    meaning: 'Too curious about other people.',
    softHint: 'Think: curious in a nosy way.',
  },
  {
    word: 'WORK',
    meaning: 'Activity involving effort to achieve a purpose.',
    softHint: 'Think: meaning hard work.',
  },
  {
    word: 'WISE',
    meaning: 'Having experience, knowledge, and good judgment.',
    softHint: 'Think: smart with patience.',
  },
  {
    word: 'CALM',
    meaning: 'Not showing or feeling nervousness or anger.',
    softHint: 'Think: steady pulse energy.',
  },
  {
    word: 'SHARP',
    meaning: 'Quick to notice or understand; keen.',
    softHint: 'Think: mind like a blade.',
  },
  {
    word: 'CLEAR',
    meaning: 'Easy to understand; free of confusion.',
    softHint: 'Think: no fog on the idea.',
  },
]

export const RIDDLE_HINT_PENALTY = 20
export const MEANING_HINT_PENALTY = 25

const riddles: Record<string, string> = {
  FOCUS: 'I make the background fade without turning off the lights.',
  GRIT: 'I’m what keeps your feet moving when motivation has gone home.',
  FLAIR: 'Two people do the same thing. I’m what makes one worth watching.',
  CURE: 'I make the patient stop needing me.',
  OPEN: 'A door becomes this when it makes room for a guest.',
  TONE: 'I can turn “fine” into a compliment or a warning.',
  BOLD: 'I raise my hand before I know who else will.',
  QUICK: 'By the time you look up, I’m already done.',
  FREE: 'A bird becomes this when the cage door swings wide.',
  NOSY: 'I treat someone else’s closed door like an invitation.',
  WORK: 'I turn a plan on paper into something you can use.',
  WISE: 'I’m what experience leaves behind when you pay attention.',
  CALM: 'The storm is loud. My heartbeat doesn’t have to be.',
  SHARP: 'I catch the detail that everyone else missed.',
  CLEAR: 'I’m what an explanation becomes when the fog lifts.',
}

export function riddleForClue({ answer }: CrosswordClue): string {
  if (riddles[answer]) return riddles[answer]
  const vowels = answer.match(/[AEIOU]/g)?.length ?? 0
  const vowelClue = vowels === 0 ? 'I have no A, E, I, O or U'
    : vowels === 1 ? 'I have one A/E/I/O/U vowel' : `I have ${vowels} A/E/I/O/U vowels`
  const repeats = new Set(answer).size < answer.length
  return `${vowelClue}, and ${repeats ? 'at least one of my letters comes back' : 'each of my letters appears just once'}.`
}

export type ClueScoreState = {
  riddleHinted: boolean
  meaningHinted: boolean
  revealed: boolean
  solved: boolean
}

export type ZModeScore = {
  earned: number
  max: number
  riddleHintsUsed: number
  meaningHintsUsed: number
  revealsUsed: number
}

export function emptyClueState(): ClueScoreState {
  return { riddleHinted: false, meaningHinted: false, revealed: false, solved: false }
}

export function vocabToCrosswordWords(words: VocabWord[]): CrosswordWord[] {
  return words.map((w) => ({
    word: w.word,
    meaning: w.meaning || w.meaningHi || 'A word from your library.',
    softHint: softHintFromMeaning(w.word, w.meaning || w.meaningHi || ''),
  }))
}

export function dailyZSeed(userId: string, date = todayKey()): string {
  return `zmode:${userId || 'guest'}:${date}`
}

export function createDailyPuzzle(words: VocabWord[], userId: string): CrosswordPuzzle {
  const seed = dailyZSeed(userId)
  const fromLibrary = vocabToCrosswordWords(words)
  const pool = [...fromLibrary, ...ZMODE_FALLBACK]
  const puzzle = buildCrossword(pool, seed)
  if (puzzle) return puzzle
  const forced = buildCrossword(ZMODE_FALLBACK, `${seed}:forced`)
  if (forced) return forced
  return buildCrossword(ZMODE_FALLBACK.slice(0, 6), 'z-static')!
}

export function maxScore(puzzle: CrosswordPuzzle): number {
  return puzzle.clues.reduce((sum, c) => sum + cluePoints(c.answer), 0)
}

export function computeClueEarned(
  answer: string,
  state: ClueScoreState | undefined,
): number {
  if (!state?.solved) return 0
  if (state.revealed) return 0
  const base = cluePoints(answer)
  const penalty =
    (state.riddleHinted ? RIDDLE_HINT_PENALTY : 0) + (state.meaningHinted ? MEANING_HINT_PENALTY : 0)
  return Math.max(0, base - penalty)
}

export function computeScore(
  puzzle: CrosswordPuzzle,
  states: Record<string, ClueScoreState>,
): ZModeScore {
  let earned = 0
  let riddleHintsUsed = 0
  let meaningHintsUsed = 0
  let revealsUsed = 0
  for (const clue of puzzle.clues) {
    const st = states[clue.id]
    if (st?.riddleHinted) riddleHintsUsed += 1
    if (st?.meaningHinted) meaningHintsUsed += 1
    if (st?.revealed) revealsUsed += 1
    earned += computeClueEarned(clue.answer, st)
  }
  return { earned, max: maxScore(puzzle), riddleHintsUsed, meaningHintsUsed, revealsUsed }
}

const BEST_KEY = 'retain-zmode-best'

export function loadBestScore(userId: string, date = todayKey()): number {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    if (!raw) return 0
    const data = JSON.parse(raw) as Record<string, number>
    return data[`${userId}:${date}`] ?? 0
  } catch {
    return 0
  }
}

export function saveBestScore(userId: string, score: number, date = todayKey()) {
  try {
    const raw = localStorage.getItem(BEST_KEY)
    const data = raw ? (JSON.parse(raw) as Record<string, number>) : {}
    const key = `${userId}:${date}`
    data[key] = Math.max(data[key] ?? 0, score)
    localStorage.setItem(BEST_KEY, JSON.stringify(data))
  } catch {
    // ignore
  }
}

export { cluePoints }
