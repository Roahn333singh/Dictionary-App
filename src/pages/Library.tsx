import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { WordCard } from '../components/WordCard'
import { useVocab } from '../hooks/useVocab'
import { isDue } from '../lib/vocab'
import type { VocabWord } from '../types'

type Filter = 'all' | 'due' | 'learning' | 'strong'

export function Library() {
  const { words, deleteWord, updateWord } = useVocab()
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<Filter>('all')
  const [selected, setSelected] = useState<VocabWord | null>(null)
  const [editing, setEditing] = useState(false)
  const [modalRevealed, setModalRevealed] = useState(false)
  const [draft, setDraft] = useState({
    word: '',
    meaning: '',
    meaningHi: '',
    example1: '',
    example2: '',
    notes: '',
  })

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
    setSelected(word)
    setEditing(false)
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
    const patch = {
      word: draft.word,
      meaning: draft.meaning,
      meaningHi: draft.meaningHi,
      examples: [draft.example1, draft.example2] as [string, string],
      notes: draft.notes,
    }
    updateWord(selected.id, patch)
    setSelected({ ...selected, ...patch })
    setEditing(false)
  }

  function removeWord() {
    if (!selected) return
    if (!window.confirm(`Delete “${selected.word}”?`)) return
    deleteWord(selected.id)
    setSelected(null)
  }

  return (
    <>
      <div className="page-head">
        <h1>Library</h1>
        <p>Tap a word to reveal its meaning.</p>
      </div>

      <div className="toolbar">
        <input
          className="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search words, meanings, sentences…"
        />
        <div className="filter-pills">
          {(
            [
              ['all', 'All'],
              ['due', 'Due'],
              ['learning', 'Learning'],
              ['strong', 'Strong'],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
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
          <h3>{words.length === 0 ? 'Your vault is empty' : 'No matches'}</h3>
          <p>
            {words.length === 0
              ? 'Type any English word — Retain fills meaning and examples for you.'
              : 'Try a different search or filter.'}
          </p>
          {words.length === 0 && (
            <Link className="btn btn-primary" to="/add">
              Capture a word
            </Link>
          )}
        </div>
      ) : (
        <div className="word-list section">
          {filtered.map((word) => (
            <WordCard key={word.id} word={word} onOpen={openWord} />
          ))}
        </div>
      )}

      {selected && (
        <div className="modal-backdrop" onClick={() => setSelected(null)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
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
                {selected.phonetic && (
                  <p style={{ color: 'var(--ink-faint)', marginTop: '0.25rem' }}>
                    {selected.phonetic}
                    {selected.partOfSpeech ? ` · ${selected.partOfSpeech}` : ''}
                  </p>
                )}

                {modalRevealed && (
                  <div className="modal-revealed">
                    <p style={{ color: 'var(--ink-soft)', marginTop: '0.85rem' }}>
                      {selected.meaning}
                    </p>
                    {selected.meaningHi && (
                      <p
                        className="hindi-text"
                        style={{ color: 'var(--mint)', marginTop: '0.45rem' }}
                      >
                        {selected.meaningHi}
                      </p>
                    )}
                    <p className="sentence">“{selected.examples[0]}”</p>
                    <p className="sentence" style={{ marginTop: 0 }}>
                      “{selected.examples[1]}”
                    </p>
                    {selected.notes && (
                      <p style={{ color: 'var(--ink-faint)', lineHeight: 1.5 }}>
                        {selected.notes}
                      </p>
                    )}
                  </div>
                )}

                <div className="modal-actions">
                  <button className="btn btn-ghost" type="button" onClick={removeWord}>
                    Delete
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => setEditing(true)}
                  >
                    Edit
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => setSelected(null)}
                  >
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h2>Edit word</h2>
                <div className="form" style={{ marginTop: '1rem' }}>
                  <div className="field field-word">
                    <label htmlFor="edit-word">Word</label>
                    <input
                      id="edit-word"
                      value={draft.word}
                      onChange={(e) => setDraft({ ...draft, word: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meaning">English meaning</label>
                    <textarea
                      id="edit-meaning"
                      value={draft.meaning}
                      onChange={(e) => setDraft({ ...draft, meaning: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-meaning-hi">Hindi meaning</label>
                    <textarea
                      id="edit-meaning-hi"
                      className="hindi"
                      value={draft.meaningHi}
                      onChange={(e) => setDraft({ ...draft, meaningHi: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-ex1">Example 1</label>
                    <textarea
                      id="edit-ex1"
                      value={draft.example1}
                      onChange={(e) => setDraft({ ...draft, example1: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-ex2">Example 2</label>
                    <textarea
                      id="edit-ex2"
                      value={draft.example2}
                      onChange={(e) => setDraft({ ...draft, example2: e.target.value })}
                    />
                  </div>
                  <div className="field">
                    <label htmlFor="edit-notes">Notes</label>
                    <textarea
                      id="edit-notes"
                      value={draft.notes}
                      onChange={(e) => setDraft({ ...draft, notes: e.target.value })}
                    />
                  </div>
                </div>
                <div className="modal-actions">
                  <button className="btn btn-ghost" type="button" onClick={() => setEditing(false)}>
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
    </>
  )
}
