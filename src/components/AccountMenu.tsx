import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { signOut, useAuth } from '../hooks/useAuth'
import { hasUnsyncedChanges, setActiveUser, useSyncState } from '../hooks/useVocab'
import type { SyncStatus } from '../types'

type MenuPos = { top: number; right: number }

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Loading your words…',
  syncing: 'Saving…',
  synced: 'All words saved to your account',
  offline: 'Offline — saved on this device, will sync when online',
  error: 'Couldn’t reach the server — retrying automatically',
}

export function AccountMenu() {
  const { session } = useAuth()
  const { status } = useSyncState()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos>({ top: 0, right: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  const user = session?.user
  const meta = (user?.user_metadata ?? {}) as { display_name?: string }
  const name = meta.display_name || user?.email?.split('@')[0] || 'You'
  const initial = name.trim().charAt(0).toUpperCase()

  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) })
  }

  useLayoutEffect(() => {
    if (open) updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return
    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target) || menuRef.current?.contains(target)) return
      setOpen(false)
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', updatePosition)
    window.addEventListener('scroll', updatePosition, true)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', updatePosition)
      window.removeEventListener('scroll', updatePosition, true)
    }
  }, [open])

  async function onSignOut() {
    if (
      hasUnsyncedChanges() &&
      !window.confirm(
        'Some changes haven’t reached the server yet. They stay on this device and will sync next time you sign in here. Sign out anyway?',
      )
    ) {
      return
    }
    setOpen(false)
    await signOut()
    setActiveUser(null)
  }

  if (!user) return null

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`account-btn sync-${status}`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <span>{initial}</span>
        <i className="sync-dot" aria-hidden />
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="theme-menu theme-menu-portal account-menu"
            role="menu"
            style={{ top: pos.top, right: pos.right }}
          >
            <div className="account-who">
              <small>Signed in as</small>
              <strong>{name}</strong>
            </div>
            <div className={`account-status sync-${status}`}>
              <i className="sync-dot" aria-hidden />
              {STATUS_TEXT[status]}
            </div>
            <button type="button" role="menuitem" className="btn btn-ghost btn-sm" onClick={onSignOut}>
              Sign out
            </button>
          </div>,
          document.body,
        )}
    </div>
  )
}
