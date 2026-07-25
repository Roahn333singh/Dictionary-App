import { useState } from 'react'
import type { VocabWord } from '../types'

type WordCardProps = {
  word: VocabWord
  onOpen?: (word: VocabWord) => void
}

export function WordCard({ word, onOpen }: WordCardProps) {
  const [revealed, setRevealed] = useState(false)

  return (
    <div className={`word-row${revealed ? ' is-revealed' : ''}`}>
      <div className="word-main">
        <button
          type="button"
          className="word-title word-title-btn"
          onClick={() => setRevealed((v) => !v)}
          aria-expanded={revealed}
          title={revealed ? 'Hide meaning' : 'Reveal meaning'}
        >
          {word.word}
        </button>

        {revealed && (
          <div className="meaning-reveal">
            <div className="word-meaning">{word.meaning}</div>
            {word.meaningHi && (
              <div className="word-meaning hindi-text">{word.meaningHi}</div>
            )}
            {onOpen && (
              <button
                type="button"
                className="word-details-link"
                onClick={() => onOpen(word)}
              >
                Details
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
