import type { AppStats, VocabWord } from '../types'
import { isAvatarId, writeAvatarCache } from './avatars'
import { notifyShare, type NotifyDelivery } from './push'
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

export type Friend = { userId: string; name: string; avatarId: string }

export type FriendRequest = {
  id: string
  otherUser: string
  otherName: string
  otherAvatar: string
  direction: 'incoming' | 'outgoing'
  createdAt: string
}

export type MyProfile = {
  userId: string
  name: string
  avatarId: string
}

export type FriendInviteResult = {
  ok: boolean
  status?: 'pending' | 'accepted' | 'declined'
  name?: string
  already?: boolean
  incoming?: boolean
  error?: string
  id?: string
}

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

export async function fetchFriends(_myId: string): Promise<Friend[]> {
  const { data, error } = await client().rpc('list_friends')
  if (error) throw error
  return ((data as { user_id: string; name: string; avatar_id?: string }[] | null) ?? [])
    .filter((p) => p.user_id && p.name)
    .map((p) => ({
      userId: p.user_id,
      name: p.name,
      avatarId: p.avatar_id || 'boy-1-1',
    }))
}

export async function fetchFriendRequests(): Promise<FriendRequest[]> {
  const { data, error } = await client().rpc('list_friend_requests')
  if (error) throw error
  return ((data as {
    id: string
    other_user: string
    other_name: string
    other_avatar?: string
    direction: string
    created_at: string
  }[] | null) ?? [])
    .filter((r) => r.direction === 'incoming' || r.direction === 'outgoing')
    .map((r) => ({
      id: r.id,
      otherUser: r.other_user,
      otherName: r.other_name || 'Someone',
      otherAvatar: r.other_avatar || 'boy-1-1',
      direction: r.direction as 'incoming' | 'outgoing',
      createdAt: r.created_at,
    }))
}

export async function fetchMyProfile(): Promise<MyProfile | null> {
  const { data, error } = await client().rpc('get_my_profile')
  if (error) throw error
  const row = (data as { user_id: string; name: string; avatar_id: string }[] | null)?.[0]
  if (!row?.user_id) return null
  return { userId: row.user_id, name: row.name, avatarId: typeof row.avatar_id === 'string' ? row.avatar_id : '' }
}

export async function saveMyAvatar(avatarId: string): Promise<{ ok: boolean; error?: string; avatarId?: string }> {
  if (!isAvatarId(avatarId)) return { ok: false, error: 'Unknown avatar' }
  const supabase = client()
  const { data: sessionData } = await supabase.auth.getSession()
  const uid = sessionData.session?.user.id
  if (!uid) return { ok: false, error: 'Sign in first' }

  const savedAt = Date.now()
  // Cache before the network so a refresh mid-save still has the face.
  writeAvatarCache(uid, { id: avatarId, savedAt, pending: true })

  const { data, error } = await supabase.rpc('set_my_avatar', { p_avatar_id: avatarId })
  const rpc = (data ?? {}) as { ok?: boolean; error?: string; avatar_id?: string }
  let saved = !error && rpc.ok === true && (!rpc.avatar_id || rpc.avatar_id === avatarId)

  if (!saved) {
    const updated = await supabase
      .from('profiles')
      .update({ avatar_id: avatarId })
      .eq('user_id', uid)
      .select('avatar_id')
      .maybeSingle()
    saved = !updated.error && updated.data?.avatar_id === avatarId
    if (!saved) {
      return {
        ok: false,
        error: error?.message || rpc.error || updated.error?.message || 'Could not save avatar',
      }
    }
  }

  const profile = await fetchMyProfile().catch(() => null)
  if (profile && isAvatarId(profile.avatarId) && profile.avatarId !== avatarId) {
    return { ok: false, error: 'Avatar did not save. Try again.' }
  }
  if (!profile || profile.avatarId === avatarId) {
    writeAvatarCache(uid, { id: avatarId, savedAt, pending: false })
  }

  void supabase.auth.updateUser({ data: { avatar_id: avatarId } }).catch(() => {
    // Profile row is the source of truth; metadata is a backup.
  })

  return { ok: true, avatarId }
}

export type EmailMatch = {
  userId: string
  email: string
  name: string
}

/** True only for a full address, so partial strings never become a search. */
export function isCompleteEmail(value: string) {
  const email = value.trim().toLowerCase()
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

/** Exact sign-in email only. A partial address, a username, or any other miss returns null. */
export async function lookupUserByEmail(email: string): Promise<EmailMatch | null> {
  const cleaned = email.trim().toLowerCase()
  if (!isCompleteEmail(cleaned)) return null
  const { data, error } = await client().rpc('find_user_by_email', { p_email: cleaned })
  if (error) throw error
  const row = (data as { user_id: string; email?: string; name?: string }[] | null)?.[0]
  if (!row?.user_id || !row.email) return null
  const found = row.email.trim().toLowerCase()
  if (found !== cleaned) return null
  return {
    userId: row.user_id,
    email: found,
    name: row.name || 'Friend',
  }
}

export async function sendFriendRequest(email: string): Promise<FriendInviteResult> {
  const { data, error } = await client().rpc('send_friend_request', { p_email: email.trim() })
  if (error) throw error
  const result = (data ?? {}) as FriendInviteResult
  return {
    ok: Boolean(result.ok),
    status: result.status,
    name: result.name,
    already: result.already,
    incoming: result.incoming,
    error: result.error,
    id: result.id,
  }
}

export async function respondFriendRequest(id: string, accept: boolean): Promise<FriendInviteResult> {
  const { data, error } = await client().rpc('respond_friend_request', {
    p_id: id,
    p_accept: accept,
  })
  if (error) throw error
  const result = (data ?? {}) as FriendInviteResult
  return {
    ok: Boolean(result.ok),
    status: result.status,
    already: result.already,
    error: result.error,
  }
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

export type SendResult = {
  userId: string
  ok: boolean
  alreadyShared?: boolean
  notify?: NotifyDelivery
}

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
        const { data, error } = await client()
          .from('shares')
          .insert({
            from_user: myId,
            to_user: toUser,
            word: word.word.trim().slice(0, 80),
            payload,
            note: note.trim().slice(0, 200),
          })
          .select('id')
          .single()
        if (error) {
          if (error.code === '23505') return { userId: toUser, ok: true, alreadyShared: true }
          throw error
        }
        const notify = await notifyShare(String(data.id))
        return { userId: toUser, ok: true, notify }
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
