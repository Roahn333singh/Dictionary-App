import { useEffect, useRef, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { LIMITS, useVocab } from '../hooks/useVocab'
import { enrichWord } from '../lib/enrich'
import type { WordEnrichment } from '../types'

export function AddWord() {
  const { words, addWord } = useVocab()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [isManual, setIsManual] = useState(false)
  const lookupSeq = useRef(0)
  const navTimer = useRef<number | undefined>(undefined)

  useEffect(() => () => window.clearTimeout(navTimer.current), [])

  function findExisting(value: string) {
    const key = value.trim().toLowerCase()
    return key ? words.find((w) => w.word.trim().toLowerCase() === key) : undefined
  }

  const existing = enrichment ? findExisting(enrichment.word) : findExisting(word)

  async function lookup(e?: FormEvent) {
    e?.preventDefault()
    if (loading) return
    const q = word.trim().replace(/\s+/g, ' ')
    if (!q) {
      setError('Type a word to look up.')
      return
    }
    if (q.length > 60) {
      setError('That’s too long to look up — try a single word or short phrase.')
      return
    }

    const seq = ++lookupSeq.current
    setLoading(true)
    setError(null)
    setEnrichment(null)
    setIsManual(false)

    try {
      const result = await enrichWord(q)
      if (seq !== lookupSeq.current) return
      setEnrichment(result)
      setWord(result.word)
    } catch (err) {
      if (seq !== lookupSeq.current) return
      const offline = typeof navigator !== 'undefined' && !navigator.onLine
      setError(
        offline
          ? 'You’re offline, so the meaning can’t be fetched. Fill it in manually or try again once you’re back online.'
          : err instanceof Error
            ? err.message
            : 'Lookup failed.',
      )
    } finally {
      if (seq === lookupSeq.current) setLoading(false)
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
    })
    setIsManual(true)
    setError(null)
  }

  function updateExample(index: 0 | 1, value: string) {
    if (!enrichment) return
    const examples: [string, string] = [...enrichment.examples]
    examples[index] = value
    setEnrichment({ ...enrichment, examples })
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    if (!enrichment || saved) return

    const ex1 = enrichment.examples[0].trim()
    const ex2 = enrichment.examples[1].trim() || ex1

    if (!enrichment.meaning.trim() || !ex1) {
      setError('Meaning and at least one example sentence are required.')
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
    setIsManual(false)

    navTimer.current = window.setTimeout(() => {
      setSaved(false)
      navigate('/review')
    }, 900)
  }

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">New word</p>
        <h1>Catch a word ✍️</h1>
        <p>Type it — Retain finds the English meaning, Hindi meaning and two example sentences.</p>
      </div>

      <form className="form" onSubmit={enrichment ? onSave : lookup}>
        <div className="field field-word">
          <label htmlFor="word">Word or phrase</label>
          <div className="lookup-row">
            <input
              id="word"
              value={word}
              onChange={(e) => {
                setWord(e.target.value)
                setEnrichment(null)
                setError(null)
                setIsManual(false)
              }}
              placeholder="e.g. articulate, rizz, serendipity"
              maxLength={LIMITS.word}
              autoCapitalize="none"
              autoCorrect="off"
              enterKeyHint="search"
              required
              autoFocus
              disabled={loading}
            />
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => lookup()}
              disabled={loading || !word.trim()}
            >
              {loading ? 'Looking up…' : 'Look up'}
            </button>
          </div>

          <div className="lookup-hint-row">
            <span className="hint">Press Look up to auto-fill meaning & examples</span>
            {!enrichment && !loading && (
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
        )}

        {loading && (
          <div className="lookup-status" aria-live="polite">
            <span className="spinner" />
            Fetching meaning, Hindi translation, and example sentences…
          </div>
        )}

        {enrichment && !loading && (
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
              <span className="chip">
                {isManual ? 'Manual entry' : 'Auto-filled — edit if you want'}
              </span>
            </div>

            <div className="field">
              <label htmlFor="meaning">Meaning (English)</label>
              <textarea
                id="meaning"
                value={enrichment.meaning}
                onChange={(e) => setEnrichment({ ...enrichment, meaning: e.target.value })}
                placeholder="Definition in simple, clear English..."
                maxLength={LIMITS.meaning}
                rows={2}
                required
                autoFocus={isManual}
              />
            </div>

            <div className="field">
              <label htmlFor="meaningHi">Meaning (Hindi)</label>
              <textarea
                id="meaningHi"
                value={enrichment.meaningHi}
                onChange={(e) => setEnrichment({ ...enrichment, meaningHi: e.target.value })}
                placeholder="हिंदी में अर्थ..."
                maxLength={LIMITS.meaning}
                rows={2}
                className="hindi"
              />
            </div>

            <div className="field">
              <label htmlFor="example1">Example sentence 1</label>
              <textarea
                id="example1"
                value={enrichment.examples[0]}
                onChange={(e) => updateExample(0, e.target.value)}
                placeholder="A natural sentence using the word..."
                maxLength={LIMITS.example}
                rows={2}
                required
              />
            </div>

            <div className="field">
              <label htmlFor="example2">Example sentence 2</label>
              <textarea
                id="example2"
                value={enrichment.examples[1]}
                onChange={(e) => updateExample(1, e.target.value)}
                placeholder="Another spoken example..."
                maxLength={LIMITS.example}
                rows={2}
              />
            </div>

            <div className="field">
              <label htmlFor="notes">Notes (optional)</label>
              <textarea
                id="notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Personal tip — when you’d use this while speaking…"
                maxLength={LIMITS.notes}
                rows={2}
              />
            </div>

            <div className="cta-row">
              <button className="btn btn-primary" type="submit" disabled={Boolean(existing) || saved}>
                Save it
              </button>
              <button
                className="btn btn-ghost"
                type="button"
                onClick={() => lookup()}
                disabled={loading}
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
