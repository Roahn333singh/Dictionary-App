import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { AutoTextarea } from '../components/AutoTextarea'
import { LIMITS, useVocab } from '../hooks/useVocab'
import { enrichWithAi, enrichWord } from '../lib/enrich'
import type { EnrichmentSource, WordEnrichment } from '../types'

type LookupKind = 'dict' | 'ai'

export function AddWord() {
  const { words, addWord } = useVocab()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState<LookupKind | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const lookupSeq = useRef(0)
  const navTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(navTimer.current), [])

  const isManual = enrichment?.source === 'manual'
  const busy = loading !== null

  function findExisting(value: string) {
    const key = value.trim().toLowerCase()
    return key ? words.find((w) => w.word.trim().toLowerCase() === key) : undefined
  }

  const existing = enrichment ? findExisting(enrichment.word) : findExisting(word)

  function validateQuery(): string | null {
    const q = word.trim().replace(/\s+/g, ' ')
    if (!q) {
      setError('Type a word to look up.')
      return null
    }
    if (q.length > 60) {
      setError('That’s too long to look up — try a single word or short phrase.')
      return null
    }
    return q
  }

  function offlineMessage() {
    return 'You’re offline, so the meaning can’t be fetched. Fill it in manually or try again once you’re back online.'
  }

  async function lookup(e?: FormEvent) {
    e?.preventDefault()
    if (busy) return
    const q = validateQuery()
    if (!q) return

    const seq = ++lookupSeq.current
    setLoading('dict')
    setError(null)
    setEnrichment(null)

    try {
      const result = await enrichWord(q)
      if (seq !== lookupSeq.current) return
      setEnrichment(result)
      setWord(result.word)
    } catch (err) {
      if (seq !== lookupSeq.current) return
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setError(offline ? offlineMessage() : err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      if (seq === lookupSeq.current) setLoading(null)
    }
  }

  async function lookupWithAi() {
    if (busy) return
    const q = validateQuery()
    if (!q) return

    const seq = ++lookupSeq.current
    setLoading('ai')
    setError(null)

    try {
      const result = await enrichWithAi(q)
      if (seq !== lookupSeq.current) return
      if (result === 'not-found') {
        setError(
          `“${q}” doesn’t look like an English word. Check the spelling or enter details manually.`,
        )
        return
      }
      if (!result) {
        const offline = typeof navigator !== 'undefined' && !navigator.onLine
        setError(
          offline
            ? offlineMessage()
            : 'AI lookup didn’t work. You can save the dictionary card or try again.',
        )
        return
      }
      setEnrichment(result)
      setWord(result.word)
    } catch (err) {
      if (seq !== lookupSeq.current) return
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setError(offline ? offlineMessage() : err instanceof Error ? err.message : 'AI lookup failed.')
    } finally {
      if (seq === lookupSeq.current) setLoading(null)
    }
  }

  function startManualEntry() {
    const q = word.trim()
    if (!q) {
      setError('Type the word or phrase first.')
      return
    }
    setEnrichment({
      word: q,
      meaning: '',
      meaningHi: '',
      examples: ['', ''],
      phonetic: '',
      partOfSpeech: 'noun',
      source: 'manual',
    })
    setError(null)
  }

  function updateExample(index: 0 | 1, value: string) {
    if (!enrichment) return
    const examples: [string, string] = [...enrichment.examples]
    examples[index] = value
    setEnrichment({ ...enrichment, examples })
  }

  function sourceLabel(source?: EnrichmentSource) {
    if (source === 'ai') return 'AI'
    if (source === 'manual') return 'Manual entry'
    return 'Dictionary'
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    if (!enrichment || saved) return

    const ex1 = enrichment.examples[0].trim()
    const ex2 = enrichment.examples[1].trim() || ex1

    if (!enrichment.meaning.trim()) {
      setError('Meaning is required.')
      return
    }

    if (findExisting(enrichment.word || word)) {
      setError('This word is already in your library.')
      return
    }

    const entry = addWord({
      word: enrichment.word.trim() || word.trim(),
      meaning: enrichment.meaning.trim(),
      meaningHi: enrichment.meaningHi.trim(),
      examples: [ex1, ex2],
      notes: notes.trim(),
      phonetic: enrichment.phonetic.trim(),
      partOfSpeech: enrichment.partOfSpeech.trim() || 'noun',
    })
    if (!entry) {
      setError('Couldn’t save — please sign in again.')
      return
    }

    setSaved(true)
    setWord('')
    setEnrichment(null)
    setNotes('')

    navTimer.current = window.setTimeout(() => {
      setSaved(false)
      navigate('/review')
    }, 900)
  }

  const canAskAi = Boolean(word.trim())

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">New word</p>
        <h1>Catch a word ✍️</h1>
        <p>
          Look up uses Wiktionary — fast and free. Tap <strong>AI</strong> when you want a richer
          English + Hindi card.
        </p>
      </div>

      <form className="form" onSubmit={enrichment ? onSave : lookup}>
        <div className="field field-word">
          <label htmlFor="word">Word or phrase</label>
          <div className="lookup-stack">
            <input
              id="word"
              value={word}
              onChange={(e) => {
                setWord(e.target.value)
                setEnrichment(null)
                setError(null)
              }}
              placeholder="e.g. articulate, rizz, serendipity"
              maxLength={LIMITS.word}
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              required
              autoFocus
              disabled={busy}
            />
            <div className="lookup-actions">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() => lookup()}
                disabled={busy || !word.trim()}
              >
                {loading === 'dict' ? 'Looking up…' : 'Look up'}
              </button>
              <button
                className="btn btn-pink"
                type="button"
                onClick={() => lookupWithAi()}
                disabled={busy || !canAskAi}
              >
                {loading === 'ai' ? 'Asking AI…' : 'AI'}
              </button>
            </div>
          </div>

          <div className="lookup-hint-row">
            <span className="hint">Dictionary first. The pink AI button is optional Gemini.</span>
            {!enrichment && !busy && (
              <button
                type="button"
                className="btn-text-action"
                onClick={startManualEntry}
                disabled={!word.trim()}
              >
                or enter manually
              </button>
            )}
          </div>
        </div>

        {existing && !saved && (
          <div className="lookup-status" role="status">
            “{existing.word}” is already in your library.{' '}
            <Link to="/library" className="btn-text-action">
              Open library
            </Link>
          </div>
        )}

        {error && (
          <div className="form-error">
            <div className="error-text">{error}</div>
            <div className="error-actions">
              {!enrichment && word.trim() && (
                <button
                  type="button"
                  className="btn btn-ghost btn-sm error-action-btn"
                  onClick={startManualEntry}
                >
                  Fill details manually instead
                </button>
              )}
            </div>
          </div>
        )}

        {busy && (
          <div className="lookup-status" aria-live="polite">
            <span className="spinner" />
            {loading === 'ai'
              ? 'Asking AI for a richer meaning, Hindi, and spoken examples…'
              : 'Looking up Wiktionary…'}
          </div>
        )}

        {enrichment && !busy && (
          <div className="enrich-panel">
            <div className="enrich-meta">
              <label htmlFor="partOfSpeech" className="sr-only">
                Part of speech
              </label>
              <select
                id="partOfSpeech"
                className="chip-select fresh"
                value={enrichment.partOfSpeech || 'noun'}
                onChange={(e) =>
                  setEnrichment({ ...enrichment, partOfSpeech: e.target.value })
                }
              >
                <option value="adjective">adjective</option>
                <option value="verb">verb</option>
                <option value="noun">noun</option>
                <option value="adverb">adverb</option>
                <option value="phrase">phrase</option>
                <option value="idiom">idiom</option>
                <option value="interjection">interjection</option>
              </select>

              {enrichment.phonetic && <span className="chip">{enrichment.phonetic}</span>}
              <span className="chip">{sourceLabel(enrichment.source)}</span>
            </div>

            <div className="field">
              <label htmlFor="meaning">Meaning (English)</label>
              <AutoTextarea
                id="meaning"
                value={enrichment.meaning}
                onChange={(e) => setEnrichment({ ...enrichment, meaning: e.target.value })}
                placeholder="Definition in simple, clear English..."
                maxLength={LIMITS.meaning}
                required
                autoFocus={isManual}
              />
            </div>

            <div className="field">
              <label htmlFor="meaningHi">Meaning (Hindi)</label>
              <AutoTextarea
                id="meaningHi"
                value={enrichment.meaningHi}
                onChange={(e) => setEnrichment({ ...enrichment, meaningHi: e.target.value })}
                placeholder="हिंदी में अर्थ..."
                maxLength={LIMITS.meaning}
                className="hindi"
              />
            </div>

            <div className="field">
              <label htmlFor="example1">Example sentence 1</label>
              <AutoTextarea
                id="example1"
                value={enrichment.examples[0]}
                onChange={(e) => updateExample(0, e.target.value)}
                placeholder="A natural sentence using the word..."
                maxLength={LIMITS.example}
              />
            </div>

            <div className="field">
              <label htmlFor="example2">Example sentence 2</label>
              <AutoTextarea
                id="example2"
                value={enrichment.examples[1]}
                onChange={(e) => updateExample(1, e.target.value)}
                placeholder="Another spoken example..."
                maxLength={LIMITS.example}
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Notes (optional)</label>
              <AutoTextarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Personal tip — when you’d use this while speaking…"
                maxLength={LIMITS.notes}
              />
            </div>

            <div className="cta-row">
              <button className="btn btn-primary" type="submit" disabled={Boolean(existing) || saved}>
                Save it
              </button>
              <button
                className="btn btn-pink"
                type="button"
                onClick={() => lookupWithAi()}
                disabled={busy || !canAskAi}
              >
                {loading === 'ai' ? 'Asking AI…' : 'AI'}
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => lookup()}
                disabled={busy}
              >
                Look up again
              </button>
            </div>
          </div>
        )}
      </form>

      {saved && <div className="toast">Saved ✨ heading to review</div>}
    </>
  )
}
