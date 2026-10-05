import type { AppStats, VocabWord } from '../types'
import { supabase } from './supabase'

type WordRow = {
  id: string
  user_id?: string
  word: string
  meaning: string
  meaning_hi: string
  examples: string[]
  notes: string
  phonetic: string
  part_of_speech: string
  created_at: string
  updated_at: string
  next_review_at: string
  interval_days: number
  ease_factor: number
  repetitions: number
  lapses: number
}

type StatsRow = {
  user_id: string
  streak: number
  last_review_date: string | null
  total_reviews: number
}

function client() {
  if (!supabase) throw new Error('Supabase is not configured')
  return supabase
}

export function rowToWord(row: WordRow): VocabWord {
  const examples = Array.isArray(row.examples) ? row.examples : []
  return {
    id: row.id,
    word: row.word,
    meaning: row.meaning ?? '',
    meaningHi: row.meaning_hi ?? '',
    examples: [examples[0] ?? '', examples[1] ?? examples[0] ?? ''],
    notes: row.notes ?? '',
    phonetic: row.phonetic ?? '',
    partOfSpeech: row.part_of_speech ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    nextReviewAt: row.next_review_at,
    intervalDays: Number(row.interval_days) || 0,
    easeFactor: Number(row.ease_factor) || 2.5,
    repetitions: row.repetitions ?? 0,
    lapses: row.lapses ?? 0,
  }
}

function wordToRow(word: VocabWord, userId: string): WordRow {
  return {
    id: word.id,
    user_id: userId,
    word: word.word,
    meaning: word.meaning,
    meaning_hi: word.meaningHi,
    examples: [...word.examples],
    notes: word.notes,
    phonetic: word.phonetic,
    part_of_speech: word.partOfSpeech,
    created_at: word.createdAt,
    updated_at: word.updatedAt,
    next_review_at: word.nextReviewAt,
    interval_days: word.intervalDays,
    ease_factor: word.easeFactor,
    repetitions: word.repetitions,
    lapses: word.lapses,
  }
}

export async function fetchWords(): Promise<VocabWord[]> {
  const { data, error } = await client()
    .from('words')
    .select('*')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data as WordRow[]).map(rowToWord)
}

export async function upsertWords(words: VocabWord[], userId: string): Promise<void> {
  if (words.length === 0) return
  const { error } = await client()
    .from('words')
    .upsert(words.map((w) => wordToRow(w, userId)), { onConflict: 'id' })
  if (error) throw error
}

export async function deleteWords(ids: string[]): Promise<void> {
  if (ids.length === 0) return
  const { error } = await client().from('words').delete().in('id', ids)
  if (error) throw error
}

export async function fetchStats(): Promise<AppStats | null> {
  const { data, error } = await client().from('user_stats').select('*').maybeSingle()
  if (error) throw error
  if (!data) return null
  const row = data as StatsRow
  return {
    streak: row.streak ?? 0,
    lastReviewDate: row.last_review_date ?? null,
    totalReviews: row.total_reviews ?? 0,
  }
}

export async function upsertStats(stats: AppStats, userId: string): Promise<void> {
  const row: StatsRow = {
    user_id: userId,
    streak: stats.streak,
    last_review_date: stats.lastReviewDate,
    total_reviews: stats.totalReviews,
  }
  const { error } = await client().from('user_stats').upsert(row, { onConflict: 'user_id' })
  if (error) throw error
}
