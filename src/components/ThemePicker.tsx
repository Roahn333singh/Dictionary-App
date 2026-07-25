import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useTheme } from '../hooks/useTheme'
import { THEMES } from '../lib/theme'

type MenuPos = { top: number; right: number }

export function ThemePicker() {
  const { theme, setTheme } = useTheme()
  const [open, setOpen] = useState(false)
  const [pos, setPos] = useState<MenuPos>({ top: 0, right: 0 })
  const rootRef = useRef<HTMLDivElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)

  function updatePosition() {
    const btn = buttonRef.current
    if (!btn) return
    const rect = btn.getBoundingClientRect()
    setPos({
      top: rect.bottom + 8,
      right: Math.max(12, window.innerWidth - rect.right),
    })
  }

  useLayoutEffect(() => {
    if (!open) return
    updatePosition()
  }, [open])

  useEffect(() => {
    if (!open) return

    function onPointerDown(e: PointerEvent) {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      setOpen(false)
    }

    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }

    function onReposition() {
      updatePosition()
    }

    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKey)
    window.addEventListener('resize', onReposition)
    window.addEventListener('scroll', onReposition, true)

    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onReposition)
      window.removeEventListener('scroll', onReposition, true)
    }
  }, [open])

  const active = THEMES.find((t) => t.id === theme) ?? THEMES[0]

  return (
    <div className={`theme-picker${open ? ' is-open' : ''}`} ref={rootRef}>
      <button
        ref={buttonRef}
        type="button"
        className="theme-toggle"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Theme: ${active.label}. Change UI color`}
        onClick={() => setOpen((v) => !v)}
      >
        <span className="theme-toggle-swatches" aria-hidden>
          {active.swatches.map((color) => (
            <i key={color} style={{ background: color }} />
          ))}
        </span>
        <span className="theme-toggle-label">{active.label}</span>
      </button>

      {open &&
        createPortal(
          <div
            ref={menuRef}
            className="theme-menu theme-menu-portal"
            role="listbox"
            aria-label="UI color"
            style={{ top: pos.top, right: pos.right }}
          >
            {THEMES.map((option) => (
              <button
                key={option.id}
                type="button"
                role="option"
                aria-selected={theme === option.id}
                className={`theme-option${theme === option.id ? ' active' : ''}`}
                onClick={() => {
                  setTheme(option.id)
                  setOpen(false)
                }}
              >
                <span className="theme-option-swatches" aria-hidden>
                  {option.swatches.map((color) => (
                    <i key={color} style={{ background: color }} />
                  ))}
                </span>
                <span className="theme-option-copy">
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
              </button>
            ))}
          </div>,
          document.body,
        )}
    </div>
  )
}
