import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useLocation } from 'react-router-dom'
import { saveMyAvatar } from '../lib/cloud'
import {
  DEFAULT_AVATAR_ID,
  avatarsByGender,
  getAvatar,
  isAvatarId,
  type AvatarGender,
} from '../lib/avatars'
import { AvatarFace } from './AvatarFace'

type Props = {
  initialAvatarId?: string | null
  onClose: () => void
  onPreview?: (avatarId: string) => void
  onSaved: (avatarId: string) => void
}

export function AvatarPicker({ initialAvatarId, onClose, onPreview, onSaved }: Props) {
  const start = isAvatarId(initialAvatarId) ? initialAvatarId! : DEFAULT_AVATAR_ID
  const [gender, setGender] = useState<AvatarGender>(getAvatar(start).gender)
  const [selected, setSelected] = useState(start)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const onCloseRef = useRef(onClose)
  onCloseRef.current = onClose
  const pathname = useLocation().pathname

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onCloseRef.current()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    // A tap on the current tab does not change the path, so close from the click itself.
    function onPointerDown(e: PointerEvent) {
      const target = e.target
      if (target instanceof Element && target.closest('.tabbar')) onCloseRef.current()
    }
    document.addEventListener('pointerdown', onPointerDown, true)
    return () => document.removeEventListener('pointerdown', onPointerDown, true)
  }, [])

  const openedOn = useRef(pathname)
  useEffect(() => {
    if (pathname === openedOn.current) return
    onCloseRef.current()
  }, [pathname])

  async function save() {
    if (busy) return
    setBusy(true)
    setError(null)
    try {
      const result = await saveMyAvatar(selected)
      if (!result.ok) {
        setError(result.error || 'Could not save avatar.')
        return
      }
      onSaved(result.avatarId || selected)
      onClose()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save avatar.')
    } finally {
      setBusy(false)
    }
  }

  const options = avatarsByGender(gender)

  return createPortal(
    <div className="modal-backdrop above-tabbar" onClick={onClose}>
      <div
        className="modal avatar-picker"
        role="dialog"
        aria-modal="true"
        aria-label="Choose avatar"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sheet-handle" aria-hidden />
        <p className="eyebrow">Your look</p>
        <h2 className="share-title">Pick an avatar</h2>
        <p className="friends-lead">Z boy or girl — 16 faces each. This shows up for friends when you share.</p>

        <div className="avatar-preview-row">
          <AvatarFace avatarId={selected} name="You" size="lg" />
          <div>
            <strong>{getAvatar(selected).label}</strong>
            <p className="muted">Selected</p>
          </div>
        </div>

        <div className="filter-pills avatar-gender-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={gender === 'boy'}
            className={gender === 'boy' ? 'active' : ''}
            onClick={() => setGender('boy')}
          >
            Z boy
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={gender === 'girl'}
            className={gender === 'girl' ? 'active' : ''}
            onClick={() => setGender('girl')}
          >
            Z girl
          </button>
        </div>

        <div className="avatar-grid" role="listbox" aria-label={`${gender} avatars`}>
          {options.map((av) => {
            const on = selected === av.id
            return (
              <button
                key={av.id}
                type="button"
                role="option"
                aria-selected={on}
                className={`avatar-option${on ? ' selected' : ''}`}
                onClick={() => {
                  setSelected(av.id)
                  onPreview?.(av.id)
                }}
                title={av.label}
              >
                <img src={av.src} alt={av.label} width={72} height={72} draggable={false} />
              </button>
            )
          })}
        </div>

        {error && <div className="form-error">{error}</div>}

        <div className="modal-actions">
          <button className="btn btn-ghost" type="button" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" type="button" onClick={() => void save()} disabled={busy}>
            {busy ? 'Saving…' : 'Save avatar'}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  )
}
