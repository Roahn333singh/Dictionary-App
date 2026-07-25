import type { AppData, ReviewRating, VocabWord } from '../types'

const STORAGE_KEY = 'retain-vocab-v1'

const defaultData = (): AppData => ({
  words: [],
  stats: {
    streak: 0,
    lastReviewDate: null,
    totalReviews: 0,
  },
})

function normalizeWord(raw: Partial<VocabWord> & { sentence?: string }): VocabWord {
  const fromExamples = Array.isArray(raw.examples)
    ? raw.examples.filter((e): e is string => typeof e === 'string' && e.trim().length > 0)
    : []
  const legacy = typeof raw.sentence === 'string' && raw.sentence.trim() ? [raw.sentence.trim()] : []
  const merged = [...fromExamples, ...legacy]
  const examples: [string, string] = [
    merged[0] ?? '',
    merged[1] ?? merged[0] ?? '',
  ]

  return {
    id: raw.id ?? crypto.randomUUID(),
    word: raw.word ?? '',
    meaning: raw.meaning ?? '',
    meaningHi: raw.meaningHi ?? '',
    examples,
    notes: raw.notes ?? '',
    phonetic: raw.phonetic ?? '',
    partOfSpeech: raw.partOfSpeech ?? '',
    createdAt: raw.createdAt ?? new Date().toISOString(),
    updatedAt: raw.updatedAt ?? new Date().toISOString(),
    nextReviewAt: raw.nextReviewAt ?? new Date().toISOString(),
    intervalDays: raw.intervalDays ?? 0,
    easeFactor: raw.easeFactor ?? 2.5,
    repetitions: raw.repetitions ?? 0,
    lapses: raw.lapses ?? 0,
  }
}

export function loadData(): AppData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return defaultData()
    const parsed = JSON.parse(raw) as AppData
    return {
      words: Array.isArray(parsed.words)
        ? parsed.words.map((w) => normalizeWord(w as VocabWord & { sentence?: string }))
        : [],
      stats: {
        streak: parsed.stats?.streak ?? 0,
        lastReviewDate: parsed.stats?.lastReviewDate ?? null,
        totalReviews: parsed.stats?.totalReviews ?? 0,
      },
    }
  } catch {
    return defaultData()
  }
}

export function saveData(data: AppData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data))
}

export function createId(): string {
  return crypto.randomUUID()
}

export function startOfDay(date = new Date()): Date {
  const d = new Date(date)
  d.setHours(0, 0, 0, 0)
  return d
}

export function toDayKey(date = new Date()): string {
  return startOfDay(date).toISOString().slice(0, 10)
}

export function isDue(word: VocabWord, now = new Date()): boolean {
  return new Date(word.nextReviewAt).getTime() <= now.getTime()
}

export function getDueWords(words: VocabWord[], now = new Date()): VocabWord[] {
  return words
    .filter((w) => isDue(w, now))
    .sort(
      (a, b) =>
        new Date(a.nextReviewAt).getTime() - new Date(b.nextReviewAt).getTime(),
    )
}

export function getFreshness(word: VocabWord, now = new Date()): number {
  if (word.repetitions === 0) return 0.35
  const due = new Date(word.nextReviewAt).getTime()
  const created = new Date(word.createdAt).getTime()
  const span = Math.max(due - created, 1)
  const remaining = due - now.getTime()
  if (remaining <= 0) return Math.max(0.08, 0.25 - Math.min(0.17, -remaining / (1000 * 60 * 60 * 24) * 0.03))
  return Math.min(1, 0.4 + (remaining / span) * 0.6)
}

/** Simplified SM-2 style scheduling tuned for vocabulary retention. */
export function scheduleReview(
  word: VocabWord,
  rating: ReviewRating,
  now = new Date(),
): VocabWord {
  let { intervalDays, easeFactor, repetitions, lapses } = word
  let nextMs: number

  if (rating === 'again') {
    repetitions = 0
    lapses += 1
    easeFactor = Math.max(1.3, easeFactor - 0.2)
    intervalDays = 0
    nextMs = now.getTime() + 10 * 60 * 1000 // 10 minutes
  } else {
    if (repetitions === 0) {
      intervalDays = rating === 'easy' ? 3 : rating === 'good' ? 1 : 0.5
    } else if (repetitions === 1) {
      intervalDays = rating === 'easy' ? 7 : rating === 'good' ? 3 : 1.5
    } else {
      const multiplier =
        rating === 'easy' ? easeFactor * 1.3 : rating === 'good' ? easeFactor : easeFactor * 0.75
      intervalDays = Math.max(1, Math.round(intervalDays * multiplier * 10) / 10)
    }

    repetitions += 1
    if (rating === 'easy') easeFactor += 0.15
    if (rating === 'hard') easeFactor = Math.max(1.3, easeFactor - 0.15)
    nextMs = now.getTime() + intervalDays * 24 * 60 * 60 * 1000
  }

  return {
    ...word,
    intervalDays,
    easeFactor: Math.round(easeFactor * 100) / 100,
    repetitions,
    lapses,
    nextReviewAt: new Date(nextMs).toISOString(),
    updatedAt: now.toISOString(),
  }
}

export function updateStreak(stats: AppData['stats'], now = new Date()): AppData['stats'] {
  const today = toDayKey(now)
  if (stats.lastReviewDate === today) {
    return { ...stats, totalReviews: stats.totalReviews + 1 }
  }

  const yesterday = toDayKey(new Date(now.getTime() - 24 * 60 * 60 * 1000))
  const streak =
    stats.lastReviewDate === yesterday ? stats.streak + 1 : 1

  return {
    streak,
    lastReviewDate: today,
    totalReviews: stats.totalReviews + 1,
  }
}

export function formatRelativeDue(iso: string, now = new Date()): string {
  const diff = new Date(iso).getTime() - now.getTime()
  const mins = Math.round(diff / (60 * 1000))
  if (mins <= 0) return 'Due now'
  if (mins < 60) return `in ${mins}m`
  const hours = Math.round(mins / 60)
  if (hours < 24) return `in ${hours}h`
  const days = Math.round(hours / 24)
  if (days === 1) return 'tomorrow'
  if (days < 30) return `in ${days}d`
  return `in ${Math.round(days / 30)}mo`
}
