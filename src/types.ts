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

export interface UserStore extends AppData {
  /** word id → change token for edits not yet saved to the cloud */
  dirty: Record<string, string>
  /** ids deleted locally but not yet deleted in the cloud */
  deleted: string[]
  statsDirty: boolean
}

export type SyncStatus = 'idle' | 'syncing' | 'synced' | 'offline' | 'error'

export interface WordEnrichment {
  word: string
  meaning: string
  meaningHi: string
  examples: [string, string]
  phonetic: string
  partOfSpeech: string
}
