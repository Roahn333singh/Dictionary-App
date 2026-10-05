import { useEffect, useLayoutEffect, useState, type ReactNode } from 'react'
import { useAuth } from '../hooks/useAuth'
import { setActiveUser, useSyncState } from '../hooks/useVocab'
import { SignIn } from '../pages/SignIn'

const MAX_LOADING_MS = 6000

function Loading({ label }: { label: string }) {
  return (
    <div className="auth-screen">
      <div className="lookup-status" aria-live="polite">
        <span className="spinner" />
        {label}
      </div>
    </div>
  )
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { session, loading } = useAuth()
  const { userId: activeUserId, ready, wordCount } = useSyncState()
  const userId = session?.user.id ?? null
  const [waitedTooLong, setWaitedTooLong] = useState(false)

  useLayoutEffect(() => {
    if (!loading) setActiveUser(userId)
  }, [loading, userId])

  useEffect(() => {
    setWaitedTooLong(false)
    if (!userId) return
    const id = window.setTimeout(() => setWaitedTooLong(true), MAX_LOADING_MS)
    return () => window.clearTimeout(id)
  }, [userId])

  if (loading) return <Loading label="Signing you in…" />
  if (!userId) return <SignIn />
  if (activeUserId !== userId) return <Loading label="Loading your words…" />
  if (!ready && wordCount === 0 && !waitedTooLong) return <Loading label="Loading your words…" />
  return <>{children}</>
}
