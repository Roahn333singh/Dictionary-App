import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { ReviewRating, SyncStatus, UserStore, VocabWord } from '../types'
import { deleteWords, fetchStats, fetchWords, upsertStats, upsertWords } from '../lib/cloud'
import {
  createId,
  emptyUserStore,
  getDueWords,
  loadUnclaimedLegacyData,
  loadUserStore,
  markLegacyDismissed,
  markLegacyImported,
  saveUserStore,
  scheduleReview,
  updateStreak,
} from '../lib/vocab'

type Snapshot = {
  userId: string | null
  data: UserStore
  status: SyncStatus
  /** true once the first cloud fetch finished (or failed) for this user */
  ready: boolean
  legacyCount: number
}

let snapshot: Snapshot = {
  userId: null,
  data: emptyUserStore(),
  status: 'idle',
  ready: false,
  legacyCount: 0,
}

const listeners = new Set<() => void>()
let changeSeq = 0
let retryTimer: number | undefined
let flushing: Promise<void> | null = null
let flushAgain = false

function emit() {
  listeners.forEach((l) => l())
}

function patchSnapshot(patch: Partial<Snapshot>) {
  snapshot = { ...snapshot, ...patch }
  emit()
}

function commit(updater: (prev: UserStore) => UserStore) {
  if (!snapshot.userId) return
  const data = updater(snapshot.data)
  saveUserStore(snapshot.userId, data)
  patchSnapshot({ data })
}

function changeToken() {
  changeSeq += 1
  return `${Date.now()}-${changeSeq}`
}

function hasPending(data: UserStore) {
  return Object.keys(data.dirty).length > 0 || data.deleted.length > 0 || data.statsDirty
}

function sortWords(words: VocabWord[]) {
  return [...words].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime(),
  )
}

function failedStatus(): SyncStatus {
  return typeof navigator !== 'undefined' && !navigator.onLine ? 'offline' : 'error'
}

function scheduleRetry() {
  window.clearTimeout(retryTimer)
  retryTimer = window.setTimeout(() => void flush(), 15_000)
}

async function flushOnce(): Promise<void> {
  const userId = snapshot.userId
  if (!userId) return
  const data = snapshot.data
  if (!hasPending(data)) {
    if (snapshot.status !== 'synced') patchSnapshot({ status: 'synced' })
    return
  }

  const dirtySnapshot = { ...data.dirty }
  const deletedSnapshot = [...data.deleted]
  const statsSnapshot = data.statsDirty ? data.stats : null

  patchSnapshot({ status: 'syncing' })
  try {
    await upsertWords(
      data.words.filter((w) => dirtySnapshot[w.id]),
      userId,
    )
    await deleteWords(deletedSnapshot)
    if (statsSnapshot) await upsertStats(statsSnapshot, userId)
  } catch (err) {
    console.warn('Sync failed, will retry', err)
    if (snapshot.userId === userId) {
      patchSnapshot({ status: failedStatus() })
      scheduleRetry()
    }
    return
  }

  if (snapshot.userId !== userId) return
  commit((prev) => {
    const dirty = { ...prev.dirty }
    for (const [id, token] of Object.entries(dirtySnapshot)) {
      if (dirty[id] === token) delete dirty[id]
    }
    const done = new Set(deletedSnapshot)
    return {
      ...prev,
      dirty,
      deleted: prev.deleted.filter((id) => !done.has(id)),
      statsDirty: statsSnapshot && prev.stats === statsSnapshot ? false : prev.statsDirty,
    }
  })
  patchSnapshot({ status: hasPending(snapshot.data) ? 'syncing' : 'synced' })
}

function flush(): Promise<void> {
  if (flushing) {
    flushAgain = true
    return flushing
  }
  flushing = (async () => {
    do {
      flushAgain = false
      await flushOnce()
    } while (flushAgain && snapshot.status !== 'error' && snapshot.status !== 'offline')
  })().finally(() => {
    flushing = null
  })
  return flushing
}

async function pull(): Promise<void> {
  const userId = snapshot.userId
  if (!userId) return
  await flush()
  if (snapshot.userId !== userId) return
  try {
    const [serverWords, serverStats] = await Promise.all([fetchWords(), fetchStats()])
    if (snapshot.userId !== userId) return
    commit((prev) => {
      const deleted = new Set(prev.deleted)
      const localPending = prev.words.filter((w) => prev.dirty[w.id])
      const pendingIds = new Set(localPending.map((w) => w.id))
      const fromServer = serverWords.filter((w) => !pendingIds.has(w.id) && !deleted.has(w.id))
      return {
        ...prev,
        words: sortWords([...localPending, ...fromServer]),
        stats: prev.statsDirty ? prev.stats : (serverStats ?? prev.stats),
      }
    })
    patchSnapshot({
      ready: true,
      status: hasPending(snapshot.data) ? snapshot.status : 'synced',
    })
  } catch (err) {
    console.warn('Could not load words from the cloud', err)
    if (snapshot.userId === userId) {
      patchSnapshot({ ready: true, status: failedStatus() })
      scheduleRetry()
    }
  }
}

/** Switch the store to a signed-in user (or clear it on sign-out). */
export function setActiveUser(userId: string | null) {
  if (snapshot.userId === userId) return
  window.clearTimeout(retryTimer)
  if (!userId) {
    snapshot = { userId: null, data: emptyUserStore(), status: 'idle', ready: false, legacyCount: 0 }
    emit()
    return
  }
  const data = loadUserStore(userId)
  const legacy = loadUnclaimedLegacyData(userId)
  snapshot = {
    userId,
    data,
    status: hasPending(data) ? 'syncing' : 'idle',
    ready: false,
    legacyCount: legacy?.words.length ?? 0,
  }
  emit()
  void pull()
}

export function hasUnsyncedChanges() {
  return hasPending(snapshot.data)
}

export function importLegacyWords() {
  const userId = snapshot.userId
  if (!userId) return 0
  const legacy = loadUnclaimedLegacyData(userId)
  if (!legacy) {
    patchSnapshot({ legacyCount: 0 })
    return 0
  }
  let added = 0
  commit((prev) => {
    const ids = new Set(prev.words.map((w) => w.id))
    const names = new Set(prev.words.map((w) => w.word.trim().toLowerCase()))
    const fresh = legacy.words.filter(
      (w) => !ids.has(w.id) && !names.has(w.word.trim().toLowerCase()),
    )
    added = fresh.length
    const dirty = { ...prev.dirty }
    fresh.forEach((w) => {
      dirty[w.id] = changeToken()
    })
    const stats =
      legacy.stats.totalReviews > prev.stats.totalReviews
        ? { ...legacy.stats }
        : prev.stats
    return {
      ...prev,
      words: sortWords([...fresh, ...prev.words]),
      dirty,
      stats,
      statsDirty: prev.statsDirty || stats !== prev.stats,
    }
  })
  markLegacyImported()
  patchSnapshot({ legacyCount: 0 })
  void flush()
  return added
}

export function dismissLegacyWords() {
  if (!snapshot.userId) return
  markLegacyDismissed(snapshot.userId)
  patchSnapshot({ legacyCount: 0 })
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => void flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && snapshot.userId) void pull()
  })
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return snapshot
}

type AddWordInput = {
  word: string
  meaning: string
  meaningHi: string
  examples: [string, string]
  notes?: string
  phonetic?: string
  partOfSpeech?: string
}

type UpdateWordPatch = Partial<
  Pick<
    VocabWord,
    'word' | 'meaning' | 'meaningHi' | 'examples' | 'notes' | 'phonetic' | 'partOfSpeech'
  >
>

export function useSyncState() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  return {
    userId: snap.userId,
    wordCount: snap.data.words.length,
    status: snap.status,
    ready: snap.ready,
    legacyCount: snap.legacyCount,
    pending: hasPending(snap.data),
  }
}

export function useVocab() {
  const { data } = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const dueWords = useMemo(() => getDueWords(data.words, new Date(now)), [data.words, now])

  const addWord = useCallback((input: AddWordInput) => {
    const now = new Date().toISOString()
    const entry: VocabWord = {
      id: createId(),
      word: input.word.trim(),
      meaning: input.meaning.trim(),
      meaningHi: input.meaningHi.trim(),
      examples: [input.examples[0].trim(), input.examples[1].trim()],
      notes: (input.notes ?? '').trim(),
      phonetic: (input.phonetic ?? '').trim(),
      partOfSpeech: (input.partOfSpeech ?? '').trim(),
      createdAt: now,
      updatedAt: now,
      nextReviewAt: now,
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
    }
    commit((prev) => ({
      ...prev,
      words: [entry, ...prev.words],
      dirty: { ...prev.dirty, [entry.id]: changeToken() },
    }))
    void flush()
    return entry
  }, [])

  const updateWord = useCallback((id: string, patch: UpdateWordPatch) => {
    commit((prev) => ({
      ...prev,
      words: prev.words.map((w) => {
        if (w.id !== id) return w
        return {
          ...w,
          word: patch.word?.trim() || w.word,
          meaning: patch.meaning?.trim() ?? w.meaning,
          meaningHi: patch.meaningHi?.trim() ?? w.meaningHi,
          examples: patch.examples
            ? [patch.examples[0].trim(), patch.examples[1].trim() || patch.examples[0].trim()]
            : w.examples,
          notes: patch.notes?.trim() ?? w.notes,
          phonetic: patch.phonetic?.trim() ?? w.phonetic,
          partOfSpeech: patch.partOfSpeech?.trim() ?? w.partOfSpeech,
          updatedAt: new Date().toISOString(),
        }
      }),
      dirty: { ...prev.dirty, [id]: changeToken() },
    }))
    void flush()
  }, [])

  const deleteWord = useCallback((id: string) => {
    commit((prev) => {
      const dirty = { ...prev.dirty }
      delete dirty[id]
      return {
        ...prev,
        words: prev.words.filter((w) => w.id !== id),
        dirty,
        deleted: prev.deleted.includes(id) ? prev.deleted : [...prev.deleted, id],
      }
    })
    void flush()
  }, [])

  const reviewWord = useCallback((id: string, rating: ReviewRating) => {
    commit((prev) => ({
      ...prev,
      words: prev.words.map((w) => (w.id === id ? scheduleReview(w, rating) : w)),
      stats: updateStreak(prev.stats),
      dirty: { ...prev.dirty, [id]: changeToken() },
      statsDirty: true,
    }))
    void flush()
  }, [])

  return {
    words: data.words,
    stats: data.stats,
    dueWords,
    addWord,
    updateWord,
    deleteWord,
    reviewWord,
  }
}
