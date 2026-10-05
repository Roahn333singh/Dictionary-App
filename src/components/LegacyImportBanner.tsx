import { useState } from 'react'
import { dismissLegacyWords, importLegacyWords, useSyncState } from '../hooks/useVocab'

export function LegacyImportBanner() {
  const { legacyCount, ready } = useSyncState()
  const [message, setMessage] = useState<string | null>(null)

  if (message) {
    return (
      <div className="import-banner" role="status">
        <span>{message}</span>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMessage(null)}>
          OK
        </button>
      </div>
    )
  }

  if (!ready || legacyCount === 0) return null

  return (
    <div className="import-banner" role="region" aria-label="Import saved words">
      <span>
        Found <strong>{legacyCount}</strong> word{legacyCount === 1 ? '' : 's'} saved on this
        device before accounts. Are they yours?
      </span>
      <div className="import-actions">
        <button
          type="button"
          className="btn btn-primary btn-sm"
          onClick={() => {
            const added = importLegacyWords()
            setMessage(
              added > 0
                ? `Added ${added} word${added === 1 ? '' : 's'} to your account.`
                : 'Those words are already in your account.',
            )
          }}
        >
          Yes, add to my account
        </button>
        <button type="button" className="btn btn-ghost btn-sm" onClick={dismissLegacyWords}>
          Not mine
        </button>
      </div>
    </div>
  )
}
