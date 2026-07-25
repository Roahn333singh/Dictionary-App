import { useState, type FormEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useVocab } from '../hooks/useVocab'
import { enrichWord } from '../lib/enrich'
import type { WordEnrichment } from '../types'

export function AddWord() {
  const { addWord } = useVocab()
  const navigate = useNavigate()
  const [word, setWord] = useState('')
  const [enrichment, setEnrichment] = useState<WordEnrichment | null>(null)
  const [notes, setNotes] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  async function lookup(e?: FormEvent) {
    e?.preventDefault()
    const q = word.trim()
    if (!q) {
      setError('Type a word to look up.')
      return
    }

    setLoading(true)
    setError(null)
    setEnrichment(null)

    try {
      const result = await enrichWord(q)
      setEnrichment(result)
      setWord(result.word)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed.')
    } finally {
      setLoading(false)
    }
  }

  function updateExample(index: 0 | 1, value: string) {
    if (!enrichment) return
    const examples: [string, string] = [...enrichment.examples]
    examples[index] = value
    setEnrichment({ ...enrichment, examples })
  }

  function onSave(e: FormEvent) {
    e.preventDefault()
    if (!enrichment) return
    if (!enrichment.meaning.trim() || !enrichment.examples[0].trim() || !enrichment.examples[1].trim()) {
      setError('Meaning and both example sentences are required.')
      return
    }

    addWord({
      word: enrichment.word,
      meaning: enrichment.meaning,
      meaningHi: enrichment.meaningHi,
      examples: enrichment.examples,
      notes,
      phonetic: enrichment.phonetic,
      partOfSpeech: enrichment.partOfSpeech,
    })

    setSaved(true)
    setWord('')
    setEnrichment(null)
    setNotes('')

    window.setTimeout(() => {
      setSaved(false)
      navigate('/review')
    }, 900)
  }

  return (
    <>
      <div className="page-head">
        <h1>Capture a word</h1>
        <p>
          Just type the word. Retain looks up the English meaning, Hindi meaning, and two
          strong example sentences for you.
        </p>
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
              }}
              placeholder="e.g. articulate"
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
          <span className="hint">Press Look up — you don’t need to write the meaning yourself</span>
        </div>

        {error && <div className="form-error">{error}</div>}

        {loading && (
          <div className="lookup-status" aria-live="polite">
            <span className="spinner" />
            Fetching meaning, Hindi translation, and example sentences…
          </div>
        )}

        {enrichment && !loading && (
          <div className="enrich-panel">
            <div className="enrich-meta">
              {enrichment.partOfSpeech && (
                <span className="chip fresh">{enrichment.partOfSpeech}</span>
              )}
              {enrichment.phonetic && <span className="chip">{enrichment.phonetic}</span>}
              <span className="chip">Auto-filled — edit if you want</span>
            </div>

            <div className="field">
              <label htmlFor="meaning">Meaning (English)</label>
              <textarea
                id="meaning"
                value={enrichment.meaning}
                onChange={(e) => setEnrichment({ ...enrichment, meaning: e.target.value })}
                rows={2}
              />
            </div>

            <div className="field">
              <label htmlFor="meaningHi">Meaning (Hindi)</label>
              <textarea
                id="meaningHi"
                value={enrichment.meaningHi}
                onChange={(e) => setEnrichment({ ...enrichment, meaningHi: e.target.value })}
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
                rows={2}
              />
            </div>

            <div className="field">
              <label htmlFor="example2">Example sentence 2</label>
              <textarea
                id="example2"
                value={enrichment.examples[1]}
                onChange={(e) => updateExample(1, e.target.value)}
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
                rows={2}
              />
            </div>

            <div className="cta-row">
              <button className="btn btn-primary" type="submit">
                Save & queue for review
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

      {saved && <div className="toast">Saved — heading to review</div>}
    </>
  )
}
