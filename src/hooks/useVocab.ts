import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react'
import type { AppData, ReviewRating, VocabWord } from '../types'
import {
  createId,
  getDueWords,
  loadData,
  saveData,
  scheduleReview,
  updateStreak,
} from '../lib/vocab'

let cache = loadData()
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function setData(updater: (prev: AppData) => AppData) {
  cache = updater(cache)
  saveData(cache)
  emit()
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return cache
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

export function useVocab() {
  const data = useSyncExternalStore(subscribe, getSnapshot, getSnapshot)
  const [, tick] = useState(0)

  useEffect(() => {
    const id = window.setInterval(() => tick((n) => n + 1), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const dueWords = useMemo(() => getDueWords(data.words), [data.words, tick])

  const addWord = useCallback((input: AddWordInput) => {
    const now = new Date()
    const entry: VocabWord = {
      id: createId(),
      word: input.word.trim(),
      meaning: input.meaning.trim(),
      meaningHi: input.meaningHi.trim(),
      examples: [input.examples[0].trim(), input.examples[1].trim()],
      notes: (input.notes ?? '').trim(),
      phonetic: (input.phonetic ?? '').trim(),
      partOfSpeech: (input.partOfSpeech ?? '').trim(),
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      nextReviewAt: now.toISOString(),
      intervalDays: 0,
      easeFactor: 2.5,
      repetitions: 0,
      lapses: 0,
    }
    setData((prev) => ({ ...prev, words: [entry, ...prev.words] }))
    return entry
  }, [])

  const updateWord = useCallback((id: string, patch: UpdateWordPatch) => {
    setData((prev) => ({
      ...prev,
      words: prev.words.map((w) => {
        if (w.id !== id) return w
        return {
          ...w,
          word: patch.word?.trim() ?? w.word,
          meaning: patch.meaning?.trim() ?? w.meaning,
          meaningHi: patch.meaningHi?.trim() ?? w.meaningHi,
          examples: patch.examples
            ? [patch.examples[0].trim(), patch.examples[1].trim()]
            : w.examples,
          notes: patch.notes?.trim() ?? w.notes,
          phonetic: patch.phonetic?.trim() ?? w.phonetic,
          partOfSpeech: patch.partOfSpeech?.trim() ?? w.partOfSpeech,
          updatedAt: new Date().toISOString(),
        }
      }),
    }))
  }, [])

  const deleteWord = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      words: prev.words.filter((w) => w.id !== id),
    }))
  }, [])

  const reviewWord = useCallback((id: string, rating: ReviewRating) => {
    setData((prev) => {
      const words = prev.words.map((w) =>
        w.id === id ? scheduleReview(w, rating) : w,
      )
      return {
        words,
        stats: updateStreak(prev.stats),
      }
    })
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
