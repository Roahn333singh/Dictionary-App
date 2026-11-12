import { useSyncExternalStore } from 'react'
import {
  fetchFriendRequests,
  fetchFriends,
  fetchInbox,
  respondFriendRequest,
  sendFriendRequest,
  sendShare,
  setShareStatus,
  type Friend,
  type FriendInviteResult,
  type FriendRequest,
  type SendResult,
  type Share,
} from '../lib/cloud'
import { syncAppBadge, syncPushSubscription } from '../lib/push'
import { supabase } from '../lib/supabase'
import type { VocabWord } from '../types'
import { addWordToStore, findWordByName } from './useVocab'

type SharesState = {
  userId: string | null
  friends: Friend[]
  requests: FriendRequest[]
  inbox: Share[]
  loaded: boolean
  /** false when the sharing tables are not set up in Supabase yet */
  available: boolean
}

const POLL_MS = 45_000

let state: SharesState = {
  userId: null,
  friends: [],
  requests: [],
  inbox: [],
  loaded: false,
  available: true,
}
const listeners = new Set<() => void>()
/** shares handled on this device whose status update has not reached the server yet */
const pendingStatus = new Map<string, 'added' | 'dismissed'>()
let pollTimer: number | undefined
let refreshing: Promise<void> | null = null

function set(patch: Partial<SharesState>) {
  state = { ...state, ...patch }
  if ('inbox' in patch || 'available' in patch) {
    syncAppBadge(state.available ? state.inbox.length : 0)
  }
  listeners.forEach((l) => l())
}

let inboxChannel: { unsubscribe: () => Promise<unknown> } | null = null

function stopInboxListener() {
  void inboxChannel?.unsubscribe()
  inboxChannel = null
}

function listenForInbox(userId: string) {
  stopInboxListener()
  if (!supabase) return
  inboxChannel = supabase
    .channel(`inbox-${userId}`)
    .on(
      'postgres_changes',
      { event: '*', schema: 'public', table: 'shares', filter: `to_user=eq.${userId}` },
      () => {
        void refreshShares()
      },
    )
    .subscribe()
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
      const [friends, requests, inbox] = await Promise.all([
        fetchFriends(userId),
        fetchFriendRequests().catch((err) => {
          // Older projects without friends.sql still load shares.
          if (isMissingTable(err)) return [] as FriendRequest[]
          throw err
        }),
        fetchInbox(userId),
      ])
      if (state.userId !== userId) return
      set({
        friends,
        requests,
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
  const previous = state.userId
  window.clearInterval(pollTimer)
  stopInboxListener()
  pendingStatus.clear()
  state = { userId, friends: [], requests: [], inbox: [], loaded: false, available: true }
  listeners.forEach((l) => l())
  if (!userId) {
    if (previous) syncAppBadge(0)
    return
  }
  void syncPushSubscription()
  void refreshShares()
  listenForInbox(userId)
  pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'visible') void refreshShares()
  }, POLL_MS)
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && state.userId) {
      void syncPushSubscription()
      void refreshShares()
    }
  })
  window.addEventListener('online', () => {
    if (state.userId) void refreshShares()
  })
}

if (typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', (event) => {
    const data = event.data as { type?: string; url?: string; badgeCount?: number } | null
    if (!data || typeof data !== 'object') return
    if (data.type === 'shares-changed') {
      if (typeof data.badgeCount === 'number') syncAppBadge(data.badgeCount)
      if (state.userId) void refreshShares()
    }
    if (data.type === 'navigate' && typeof data.url === 'string' && data.url.startsWith('/')) {
      if (`${window.location.pathname}${window.location.search}` !== data.url) window.location.assign(data.url)
    }
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

export async function inviteFriendByEmail(email: string): Promise<FriendInviteResult> {
  if (!state.userId) throw new Error('Sign in to invite friends.')
  const result = await sendFriendRequest(email)
  if (result.ok) await refreshShares()
  return result
}

export async function answerFriendInvite(id: string, accept: boolean): Promise<FriendInviteResult> {
  if (!state.userId) throw new Error('Sign in first.')
  const result = await respondFriendRequest(id, accept)
  if (result.ok) await refreshShares()
  return result
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
