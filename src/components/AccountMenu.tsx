import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { accountUsername, signOut, useAuth } from '../hooks/useAuth'
import { useShares } from '../hooks/useShares'
import { hasUnsyncedChanges, setActiveUser, useSyncState } from '../hooks/useVocab'
import {
  DEFAULT_AVATAR_ID,
  cachedUserId,
  isAvatarId,
  readAvatarCache,
  readBootAvatarId,
  reconcileAvatar,
  writeAvatarCache,
} from '../lib/avatars'
import { fetchMyProfile, saveMyAvatar } from '../lib/cloud'
import { enablePush, getPushAvailability, type PushAvailability } from '../lib/push'
import type { SyncStatus } from '../types'
import { AvatarFace } from './AvatarFace'
import { AvatarPicker } from './AvatarPicker'
import { FriendsPanel } from './FriendsPanel'

type MenuPos = { top: number; right: number }

const STATUS_TEXT: Record<SyncStatus, string> = {
  idle: 'Loading your words…',
  syncing: 'Saving…',
  synced: 'All words saved to your account',
  offline: 'Offline — saved on this device, will sync when online',
  error: 'Couldn’t reach the server — retrying automatically',
}

export function AccountMenu() {
  const { session, loading } = useAuth()
  const { status } = useSyncState()
  const { requests } = useShares()
  const [open, setOpen] = useState(false)
  const [friendsOpen, setFriendsOpen] = useState(false)
  const [avatarOpen, setAvatarOpen] = useState(false)
  const [pushState, setPushState] = useState<PushAvailability>('unsupported')
  const [pos, setPos] = useState<MenuPos>({ top: 0, right: 0 })
  const [avatarId, setAvatarId] = useState(() => readBootAvatarId() || DEFAULT_AVATAR_ID)
  /** Bumps whenever the user picks a face so a slower profile fetch cannot undo it. */
  const avatarStamp = useRef(0)
  /** One server retry per face, so a default profile row cannot loop. */
  const pushedAvatar = useRef(new Set<string>())
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const incomingInvites = requests.filter((r) => r.direction === 'incoming').length

  const user = session?.user
  const meta = (user?.user_metadata ?? {}) as { avatar_id?: string }
  const name = accountUsername(user) || 'You'

  useEffect(() => {
    if (!user?.id) return
    const userId = user.id
    const stamp = avatarStamp.current
    const fromMeta = isAvatarId(meta.avatar_id) ? meta.avatar_id : null
    if (stamp === 0) setAvatarId(reconcileAvatar(readAvatarCache(userId), fromMeta))
    let cancel = false
    void fetchMyProfile()
      .then((profile) => {
        if (cancel || avatarStamp.current !== stamp) return
        const latest = readAvatarCache(userId)
        const serverId = profile?.avatarId
        const chosen = reconcileAvatar(latest, serverId)
        setAvatarId(chosen)
        const server = isAvatarId(serverId) ? serverId : null
        if (server && server === chosen) {
          writeAvatarCache(userId, {
            id: chosen,
            savedAt: latest?.savedAt || Date.now(),
            pending: false,
          })
          return
        }
        if (!pushedAvatar.current.has(chosen)) {
          pushedAvatar.current.add(chosen)
          void saveMyAvatar(chosen)
        }
      })
      .catch(() => {
        // offline / missing RPC — keep the cached face
      })
    return () => {
      cancel = true
    }
  }, [user?.id, meta.avatar_id])

  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPos({ top: rect.bottom + 8, right: Math.max(12, window.innerWidth - rect.right) })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
    setPushState(getPushAvailability())
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

  if (!user) {
    if (loading && cachedUserId()) {
      return (
        <div className="account">
          <button type="button" className="account-btn has-avatar" aria-label="Account" disabled>
            <AvatarFace avatarId={avatarId} name={name} size="sm" />
          </button>
        </div>
      )
    }
    return null
  }

  return (
    <div className="account" ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className={`account-btn sync-${status} has-avatar`}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Account: ${name}`}
        onClick={() => setOpen((v) => !v)}
      >
        <AvatarFace avatarId={avatarId} name={name} size="sm" />
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
            <div className="account-who account-who-avatar">
              <AvatarFace avatarId={avatarId} name={name} size="md" />
              <div>
                <small>Signed in as</small>
                <strong>{name}</strong>
              </div>
            </div>
            <div className={`account-status sync-${status}`}>
              <i className="sync-dot" aria-hidden />
              {STATUS_TEXT[status]}
            </div>
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false)
                setAvatarOpen(true)
              }}
            >
              Change avatar
            </button>
            <button
              type="button"
              role="menuitem"
              className="btn btn-ghost btn-sm"
              onClick={() => {
                setOpen(false)
                setFriendsOpen(true)
              }}
            >
              Friends{incomingInvites > 0 ? ` (${incomingInvites})` : ''}
            </button>
            {pushState === 'prompt' && (
              <button
                type="button"
                role="menuitem"
                className="btn btn-ghost btn-sm"
                onClick={() => {
                  void enablePush().then(() => setPushState(getPushAvailability()))
                }}
              >
                Turn on notifications
              </button>
            )}
            <button type="button" role="menuitem" className="btn btn-ghost btn-sm" onClick={onSignOut}>
              Sign out
            </button>
          </div>,
          document.body,
        )}

      {friendsOpen && <FriendsPanel onClose={() => setFriendsOpen(false)} />}
      {avatarOpen && (
        <AvatarPicker
          initialAvatarId={avatarId}
          onClose={() => setAvatarOpen(false)}
          onPreview={(id) => {
            avatarStamp.current += 1
            setAvatarId(id)
          }}
          onSaved={(id) => {
            avatarStamp.current += 1
            setAvatarId(id)
            writeAvatarCache(user.id, { id, savedAt: Date.now(), pending: false })
          }}
        />
      )}
    </div>
  )
}
