import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { ShareIcon } from '../components/Icons'
import { ShareSheet } from '../components/ShareSheet'
import { WordCard } from '../components/WordCard'
import { useShares } from '../hooks/useShares'
import { findWordByName, LIMITS, useVocab } from '../hooks/useVocab'
import { isDue } from '../lib/vocab'
import type { VocabWord } from '../types'

type Filter = 'all' | 'due' | 'learning' | 'strong'

const FILTERS: [Filter, string][] = [
  ['all', 'All'],
  ['due', 'Due'],
  ['learning', 'Learning'],
  ['strong', 'Strong'],
]

export function Library() {
  const { words, deleteWord, updateWord } = useVocab()
  const { available: sharingAvailable } = useShares()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [sharing, setSharing] = useState<VocabWord | null>(null)
  const [editing, setEditing] = useState(false)
  const [modalRevealed, setModalRevealed] = useState(false)
  const [editError, setEditError] = useState<string | null>(null)
  const [draft, setDraft] = useState({
    word: '',
    meaning: '',
    meaningHi: '',
    example1: '',
    example2: '',
    notes: '',
  })

  const selected = useMemo(() => words.find((w) => w.id === selectedId) ?? null, [words, selectedId])

  useEffect(() => {
    if (selectedId && !selected) setSelectedId(null)
  }, [selectedId, selected])

  useEffect(() => {
    if (!selected) return
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape' && !sharing) setSelectedId(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [selected, sharing])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return words.filter((w) => {
      const matchesQuery =
        !q ||
        w.word.toLowerCase().includes(q) ||
        w.meaning.toLowerCase().includes(q) ||
        w.meaningHi.toLowerCase().includes(q) ||
        w.examples.some((ex) => ex.toLowerCase().includes(q))

      if (!matchesQuery) return false
      if (filter === 'due') return isDue(w)
      if (filter === 'learning') return w.repetitions < 5
      if (filter === 'strong') return w.repetitions >= 5 && w.intervalDays >= 7
      return true
    })
  }, [words, query, filter])

  function openWord(word: VocabWord) {
    setSelectedId(word.id)
    setEditing(false)
    setEditError(null)
    setModalRevealed(false)
    setDraft({
      word: word.word,
      meaning: word.meaning,
      meaningHi: word.meaningHi,
      example1: word.examples[0],
      example2: word.examples[1],
      notes: word.notes,
    })
  }

  function saveEdit() {
    if (!selected) return
    const name = draft.word.trim()
    if (!name) {
      setEditError('The word can’t be empty.')
      return
    }
    if (!draft.meaning.trim()) {
      setEditError('Add a meaning so you can review it.')
      return
    }
    if (findWordByName(name, selected.id)) {
      setEditError(`“${name}” is already in your words.`)
      return
    }
    updateWord(selected.id, {
      word: name,
      meaning: draft.meaning,
      meaningHi: draft.meaningHi,
      examples: [draft.example1, draft.example2],
      notes: draft.notes,
    })
    setEditError(null)
    setEditing(false)
  }

  function removeWord() {
    if (!selected) return
    if (!window.confirm(`Delete “${selected.word}”? This can’t be undone.`)) return
    deleteWord(selected.id)
    setSelectedId(null)
  }

  const examples = selected ? selected.examples.filter((e, i, all) => e && all.indexOf(e) === i) : []

  return (
    <>
      <div className="page-head">
        <p className="eyebrow">{words.length} saved</p>
        <h1>Your words</h1>
        <p>Tap a word to peek at the meaning.</p>
      </div>

      <div className="toolbar">
        <input
          className="search"
          type="search"
          value={query}
          maxLength={80}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words, meanings, sentences…"
          aria-label="Search your words"
        />
        <div className="filter-pills" role="tablist">
          {FILTERS.map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={filter === id}
              className={filter === id ? 'active' : ''}
              onClick={() => setFilter(id)}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <div className="empty">
          <div className="empty-emoji" aria-hidden>{words.length === 0 ? '🫙' : '🔍'}</div>
          <h3>{words.length === 0 ? 'Your vault is empty' : 'No matches'}</h3>
          <p>
            {words.length === 0
              ? 'Type any English word — Retain fills the meaning and examples for you.'
              : 'Try a different search or filter.'}
          </p>
          {words.length === 0 && (
            <Link className="btn btn-primary" to="/add">
              Capture a word
            </Link>
          )}
        </div>
      ) : (
        <div className="word-list">
          {filtered.map((word) => (
            <WordCard key={word.id} word={word} onOpen={openWord} />
          ))}
        </div>
      )}

      {selected && !sharing && (
        <div className="modal-backdrop" onClick={() => setSelectedId(null)}>
          <div className="modal" role="dialog" aria-modal="true" aria-label={selected.word} onClick={(e) => e.stopPropagation()}>
            <div className="sheet-handle" aria-hidden />
            {!editing ? (
              <>
                <button
                  type="button"
                  className="modal-word-btn"
                  onClick={() => setModalRevealed((v) => !v)}
                  aria-expanded={modalRevealed}
                  title={modalRevealed ? 'Hide meaning' : 'Reveal meaning'}
                >
                  {selected.word}
                </button>
                {(selected.phonetic || selected.partOfSpeech) && (
                  <div className="modal-meta">
                    {selected.partOfSpeech && <span className="chip">{selected.partOfSpeech}</span>}
                    {selected.phonetic && <span className="chip">{selected.phonetic}</span>}
                  </div>
                )}
                {!modalRevealed && <p className="muted tap-hint">Tap the word to reveal</p>}

                {modalRevealed && (
                  <div className="modal-revealed">
                    {selected.meaning && <p className="modal-meaning">{selected.meaning}</p>}
                    {selected.meaningHi && <p className="modal-meaning hindi-text">{selected.meaningHi}</p>}
                    {examples.map((ex, i) => (
                      <p key={i} className="sentence">“{ex}”</p>
                    ))}
                    {selected.notes && <p className="muted">{selected.notes}</p>}
                  </div>
                )}

                <div className="modal-actions">
                  <button className="btn btn-ghost btn-danger" type="button" onClick={removeWord}>
                    Delete
                  </button>
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing(true)}>
                    Edit
                  </button>
                  {sharingAvailable && (
                    <button className="btn btn-pink" type="button" onClick={() => setSharing(selected)}>
                      <ShareIcon size={17} /> Share
                    </button>
                  )}
                  <button className="btn btn-primary" type="button" onClick={() => setSelectedId(null)}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Edit word</h2>
                <div className="form">
                  <div className="field field-word">
                    <label htmlFor="edit-word">Word</label>
                    <input
                      id="edit-word"
                      value={draft.word}
                      maxLength={LIMITS.word}
                      onChange={(e) => setDraft({ ...draft, word: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meaning">English meaning</label>
                    <textarea
                      id="edit-meaning"
                      value={draft.meaning}
                      maxLength={LIMITS.meaning}
                      onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meaning-hi">Hindi meaning</label>
                    <textarea
                      id="edit-meaning-hi"
                      className="hindi"
                      value={draft.meaningHi}
                      maxLength={LIMITS.meaning}
                      onChange={(e) => setDraft({ ...draft, meaningHi: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-ex1">Example 1</label>
                    <textarea
                      id="edit-ex1"
                      value={draft.example1}
                      maxLength={LIMITS.example}
                      onChange={(e) => setDraft({ ...draft, example1: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-ex2">Example 2</label>
                    <textarea
                      id="edit-ex2"
                      value={draft.example2}
                      maxLength={LIMITS.example}
                      onChange={(e) => setDraft({ ...draft, example2: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-notes">Notes</label>
                    <textarea
                      id="edit-notes"
                      value={draft.notes}
                      maxLength={LIMITS.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                </div>
                {editError && <div className="form-error">{editError}</div>}
                <div className="modal-actions">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => {
                      setEditing(false)
                      setEditError(null)
                    }}
                  >
                    Cancel
                  </button>
                  <button className="btn btn-primary" type="button" onClick={saveEdit}>
                    Save changes
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {sharing && <ShareSheet word={sharing} onClose={() => setSharing(null)} />}
    </>
  )
}
