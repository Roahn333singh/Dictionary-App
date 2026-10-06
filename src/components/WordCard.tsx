import { useState } from 'react'
import { compactText } from '../lib/enrich'
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
          <span className="mark">{word.word}</span>
        </button>
        {word.partOfSpeech && <span className="word-pos">{word.partOfSpeech}</span>}

        {revealed && (
          <div className="meaning-reveal">
            <div className="word-meaning">{compactText(word.meaning)}</div>
            {compactText(word.meaningHi) && (
              <div className="word-meaning hindi-text">{compactText(word.meaningHi)}</div>
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
