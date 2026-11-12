import { useState } from 'react'
import { enablePush, getPushAvailability, type PushAvailability } from '../lib/push'

const LATER_KEY = 'retain-notify-later'

function dismissedForNow() {
  try {
    return sessionStorage.getItem(LATER_KEY) === '1'
  } catch {
    return false
  }
}

export function NotifyPrompt() {
  const [availability, setAvailability] = useState<PushAvailability>(() => getPushAvailability())
  const [later, setLater] = useState(dismissedForNow)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (availability === 'ready' || availability === 'unsupported') return null
  if (availability === 'prompt' && later && !error) return null

  function turnOn() {
    if (busy) return
    const pending = enablePush()
    setBusy(true)
    setError(null)
    void pending.then((result) => {
      setBusy(false)
      setAvailability(getPushAvailability())
      if (result === 'granted') return
      if (result === 'denied') {
        setError('Notifications are blocked. Allow them for Retain in your phone settings.')
        return
      }
      if (result === 'unconfigured') {
        setError('Notifications aren’t set up on the server yet.')
        return
      }
      setError('Couldn’t turn notifications on. Try again in a moment.')
    })
  }

  return (
    <div className="import-banner" role="region" aria-label="Notifications">
      <span>
        {availability === 'install-first'
          ? 'Open Retain from your Home Screen icon to get notifications and the number on the app icon.'
          : availability === 'blocked'
            ? 'Notifications are off, so new words can’t badge the Retain icon. Turn them on in your phone settings.'
            : 'Turn on notifications to get a number on the Retain icon whenever a friend sends you a word.'}
        {error ? ` ${error}` : ''}
      </span>
      {availability === 'prompt' && (
        <div className="import-actions">
          <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => void turnOn()}>
            {busy ? 'Turning on…' : 'Turn on'}
          </button>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => {
              try {
                sessionStorage.setItem(LATER_KEY, '1')
              } catch {
                // Private browsing can block storage; hiding for this view is enough.
              }
              setLater(true)
            }}
          >
            Not now
          </button>
        </div>
      )}
    </div>
  )
}
