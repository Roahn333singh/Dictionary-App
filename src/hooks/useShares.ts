import { useSyncExternalStore } from 'react'
import {
  fetchFriends,
  fetchInbox,
  sendShare,
  setShareStatus,
  type Friend,
  type SendResult,
  type Share,
} from '../lib/cloud'
import type { VocabWord } from '../types'
import { addWordToStore, findWordByName } from './useVocab'

type SharesState = {
  userId: string | null
  friends: Friend[]
  inbox: Share[]
  loaded: boolean
  /** false when the sharing tables are not set up in Supabase yet */
  available: boolean
}

const POLL_MS = 45_000

let state: SharesState = { userId: null, friends: [], inbox: [], loaded: false, available: true }
const listeners = new Set<() => void>()
/** shares handled on this device whose status update has not reached the server yet */
const pendingStatus = new Map<string, 'added' | 'dismissed'>()
let pollTimer: number | undefined
let refreshing: Promise<void> | null = null

function set(patch: Partial<SharesState>) {
  state = { ...state, ...patch }
  listeners.forEach((l) => l())
}

function isMissingTable(err: unknown) {
  const e = err as { code?: string; message?: string } | null
  return e?.code === 'PGRST205' || e?.code === '42P01' || /does not exist|schema cache/i.test(e?.message ?? '')
}

async function flushPendingStatus() {
  for (const [id, status] of [...pendingStatus]) {
    try {
      await setShareStatus(id, status)
      pendingStatus.delete(id)
    } catch {
      return
    }
  }
}

export function refreshShares(): Promise<void> {
  const userId = state.userId
  if (!userId) return Promise.resolve()
  if (refreshing) return refreshing
  refreshing = (async () => {
    try {
      await flushPendingStatus()
      const [friends, inbox] = await Promise.all([fetchFriends(userId), fetchInbox(userId)])
      if (state.userId !== userId) return
      set({
        friends,
        inbox: inbox.filter((s) => !pendingStatus.has(s.id)),
        loaded: true,
        available: true,
      })
    } catch (err) {
      if (state.userId !== userId) return
      if (isMissingTable(err)) set({ available: false, loaded: true })
      else set({ loaded: true })
    }
  })().finally(() => {
    refreshing = null
  })
  return refreshing
}

export function setShareUser(userId: string | null) {
  if (state.userId === userId) return
  window.clearInterval(pollTimer)
  pendingStatus.clear()
  state = { userId, friends: [], inbox: [], loaded: false, available: true }
  listeners.forEach((l) => l())
  if (!userId) return
  void refreshShares()
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshShares()
  }, POLL_MS)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.userId) void refreshShares()
  })
  window.addEventListener('online', () => {
    if (state.userId) void refreshShares()
  })
}

function hideShare(id: string, status: 'added' | 'dismissed') {
  pendingStatus.set(id, status)
  set({ inbox: state.inbox.filter((s) => s.id !== id) })
  void setShareStatus(id, status)
    .then(() => pendingStatus.delete(id))
    .catch(() => {
      // Kept in pendingStatus; retried on the next refresh.
    })
}

/** Adds a shared word to my dictionary. Returns false if I already had it. */
export function acceptShare(share: Share): boolean {
  const already = Boolean(findWordByName(share.word))
  if (!already) {
    const p = share.payload
    const ex1 = p.examples[0] || p.examples[1]
    addWordToStore({
      word: share.word,
      meaning: p.meaning || '(no meaning shared)',
      meaningHi: p.meaningHi,
      examples: [ex1, p.examples[1] || ex1],
      notes: share.note,
      phonetic: p.phonetic,
      partOfSpeech: p.partOfSpeech,
    })
  }
  hideShare(share.id, 'added')
  return !already
}

export function dismissShare(share: Share) {
  hideShare(share.id, 'dismissed')
}

export async function shareWord(word: VocabWord, toUserIds: string[], note: string): Promise<SendResult[]> {
  const userId = state.userId
  if (!userId) throw new Error('Sign in to share words.')
  if (toUserIds.length === 0) throw new Error('Pick at least one friend.')
  return sendShare(word, toUserIds, userId, note)
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return state
}

export function useShares() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
}
