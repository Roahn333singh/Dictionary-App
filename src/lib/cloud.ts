import type { AppStats, VocabWord } from '../types'
import { supabase } from './supabase'
import { sanitizeWords } from './vocab'

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
  return sanitizeWords((data as WordRow[]).map(rowToWord))
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

export type Friend = { userId: string; name: string }

export type SharedWordPayload = {
  meaning: string
  meaningHi: string
  examples: [string, string]
  phonetic: string
  partOfSpeech: string
}

export type Share = {
  id: string
  fromUser: string
  word: string
  payload: SharedWordPayload
  note: string
  createdAt: string
}

type ShareRow = {
  id: string
  from_user: string
  to_user: string
  word: string
  payload: unknown
  note: string | null
  created_at: string
}

const text = (value: unknown, max: number) =>
  typeof value === 'string' ? value.trim().slice(0, max) : ''

function parsePayload(raw: unknown): SharedWordPayload {
  const p = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
  const examples = Array.isArray(p.examples) ? p.examples.map((e) => text(e, 400)).filter(Boolean) : []
  return {
    meaning: text(p.meaning, 600),
    meaningHi: text(p.meaningHi, 600),
    examples: [examples[0] ?? '', examples[1] ?? ''],
    phonetic: text(p.phonetic, 80),
    partOfSpeech: text(p.partOfSpeech, 30),
  }
}

export async function fetchFriends(myId: string): Promise<Friend[]> {
  const { data, error } = await client().from('profiles').select('user_id, name').order('name')
  if (error) throw error
  return (data as { user_id: string; name: string }[])
    .filter((p) => p.user_id !== myId && p.name)
    .map((p) => ({ userId: p.user_id, name: p.name }))
}

export async function fetchInbox(myId: string): Promise<Share[]> {
  const { data, error } = await client()
    .from('shares')
    .select('id, from_user, to_user, word, payload, note, created_at')
    .eq('to_user', myId)
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(100)
  if (error) throw error
  return (data as ShareRow[])
    .filter((r) => typeof r.word === 'string' && r.word.trim())
    .map((r) => ({
      id: r.id,
      fromUser: r.from_user,
      word: r.word.trim().slice(0, 80),
      payload: parsePayload(r.payload),
      note: text(r.note, 200),
      createdAt: r.created_at,
    }))
}

export type SendResult = { userId: string; ok: boolean; alreadyShared?: boolean }

export async function sendShare(
  word: VocabWord,
  toUserIds: string[],
  myId: string,
  note: string,
): Promise<SendResult[]> {
  const payload: SharedWordPayload = {
    meaning: word.meaning.slice(0, 600),
    meaningHi: word.meaningHi.slice(0, 600),
    examples: [word.examples[0].slice(0, 400), word.examples[1].slice(0, 400)],
    phonetic: word.phonetic.slice(0, 80),
    partOfSpeech: word.partOfSpeech.slice(0, 30),
  }
  const targets = [...new Set(toUserIds)].filter((id) => id !== myId)
  const results = await Promise.allSettled(
    targets.map(async (toUser) => {
        const { error } = await client().from('shares').insert({
          from_user: myId,
          to_user: toUser,
          word: word.word.trim().slice(0, 80),
          payload,
          note: note.trim().slice(0, 200),
        })
        if (error) {
          if (error.code === '23505') return { userId: toUser, ok: true, alreadyShared: true }
          throw error
        }
        return { userId: toUser, ok: true }
    }),
  )
  return results.map((r, i) =>
    r.status === 'fulfilled' ? r.value : { userId: targets[i], ok: false },
  )
}

export async function setShareStatus(id: string, status: 'added' | 'dismissed'): Promise<void> {
  const { error } = await client().from('shares').update({ status }).eq('id', id)
  if (error) throw error
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
