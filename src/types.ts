export type ReviewRating = 'again' | 'hard' | 'good' | 'easy'

export interface VocabWord {
  id: string
  word: string
  meaning: string
  meaningHi: string
  examples: [string, string]
  notes: string
  phonetic: string
  partOfSpeech: string
  createdAt: string
  updatedAt: string
  nextReviewAt: string
  intervalDays: number
  easeFactor: number
  repetitions: number
  lapses: number
}

export interface AppStats {
  streak: number
  lastReviewDate: string | null
  totalReviews: number
}

export interface AppData {
  words: VocabWord[]
  stats: AppStats
}

export interface WordEnrichment {
  word: string
  meaning: string
  meaningHi: string
  examples: [string, string]
  phonetic: string
  partOfSpeech: string
}
