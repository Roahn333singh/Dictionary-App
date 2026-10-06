import { useEffect, useState } from 'react'
import { addWordToStore, findWordByName } from '../hooks/useVocab'
import { compactText, enrichWord } from '../lib/enrich'
import { pickWordOfTheDay, todayKey } from '../lib/wotd'
import type { WordEnrichment } from '../types'

type Status = 'pending' | 'added' | 'skipped'

type Stored = {
  date: string
  word: string
  status: Status
}

function storageKey(userId: string) {
  return `retain-wotd-v1:${userId}`
}

function readStored(userId: string): Stored | null {
  try {
    const raw = localStorage.getItem(storageKey(userId))
    if (!raw) return null
    const parsed = JSON.parse(raw) as Stored
    if (!parsed?.date || !parsed.word) return null
    if (parsed.status !== 'added' && parsed.status !== 'skipped' && parsed.status !== 'pending') return null
    return parsed
  } catch {
    return null
  }
}

function writeStored(userId: string, value: Stored) {
  try {
    localStorage.setItem(storageKey(userId), JSON.stringify(value))
  } catch {
    // ignore quota / private mode
  }
}

export function WordOfTheDay({ userId }: { userId: string }) {
  const date = todayKey()
  const [card, setCard] = useState<Stored | null>(null)
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null)
  const [revealed, setRevealed] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    const stored = readStored(userId)
    const pickFresh = () => {
      const owned = new Set<string>()
      for (let i = 0; i < 80; i++) {
        const word = pickWordOfTheDay(userId, date, owned)
        if (!findWordByName(word)) return word
        owned.add(word.toLowerCase())
      }
      return pickWordOfTheDay(userId, date, owned)
    }

    const next: Stored =
      stored && stored.date === date
        ? stored
        : { date, word: pickFresh(), status: 'pending' }

    if (!stored || stored.date !== date) writeStored(userId, next)
    setCard(next)
    setRevealed(false)
    setError(null)

    if (next.status !== 'pending') {
      setLoading(false)
      return
    }

    setLoading(true)
    void enrichWord(next.word)
      .then((result) => {
        if (cancelled) return
        setEnrichment({
          ...result,
          word: compactText(result.word) || next.word,
          meaning: compactText(result.meaning),
          meaningHi: compactText(result.meaningHi),
          examples: [compactText(result.examples[0]), compactText(result.examples[1])],
        })
        setLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setError(err instanceof Error ? err.message : 'Couldn’t load today’s word.')
        setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [userId, date])

  if (!card || card.status !== 'pending') return null

  function finish(status: Status) {
    if (!card) return
    const next: Stored = { date: card.date, word: card.word, status }
    writeStored(userId, next)
    setCard(next)
  }

  function onAdd() {
    if (busy || !card) return
    const already = findWordByName(card.word) || (enrichment ? findWordByName(enrichment.word) : undefined)
    if (already) {
      finish('added')
      return
    }
    if (!enrichment?.meaning) {
      setError('Wait for the meaning, or skip for today.')
      return
    }
    setBusy(true)
    const entry = addWordToStore({
      word: enrichment.word || card.word,
      meaning: enrichment.meaning,
      meaningHi: enrichment.meaningHi,
      examples: enrichment.examples,
      notes: 'Word of the day',
      phonetic: enrichment.phonetic,
      partOfSpeech: enrichment.partOfSpeech,
    })
    setBusy(false)
    if (!entry) {
      setError('Couldn’t save — try again.')
      return
    }
    finish('added')
  }

  const title = enrichment?.word || card.word
  const examples = enrichment?.examples.filter((e, i, all) => e && all.indexOf(e) === i) ?? []

  return (
    <section className="wotd" aria-label="Word of the day">
      <p className="eyebrow">Word of the day</p>
      <button
        type="button"
        className={`wotd-word${revealed ? ' is-on' : ''}`}
        onClick={() => setRevealed((v) => !v)}
        aria-expanded={revealed}
        disabled={loading}
      >
        {title}
      </button>
      {enrichment?.phonetic && <p className="muted">{enrichment.phonetic}</p>}

      {loading && (
        <div className="lookup-status">
          <span className="spinner" /> Fetching today’s meaning…
        </div>
      )}

      {error && !enrichment && <div className="form-error">{error}</div>}

      {revealed && enrichment && (
        <div className="meaning-reveal">
          {enrichment.meaning && <div className="word-meaning">{enrichment.meaning}</div>}
          {enrichment.meaningHi && <div className="word-meaning hindi-text">{enrichment.meaningHi}</div>}
          {examples.map((ex, i) => (
            <p key={i} className="sentence">
              “{ex}”
            </p>
          ))}
        </div>
      )}

      {!revealed && !loading && <p className="muted tap-hint">Tap the word to peek</p>}

      <div className="wotd-actions">
        <button className="btn btn-ghost" type="button" onClick={() => finish('skipped')} disabled={busy}>
          Skip today
        </button>
        <button
          className="btn btn-primary"
          type="button"
          onClick={onAdd}
          disabled={busy || loading || !enrichment?.meaning}
        >
          Add to my words
        </button>
      </div>
    </section>
  )
}
