import { useCallback, useSyncExternalStore } from 'react'
import { applyTheme, getStoredTheme, isThemeId, type ThemeId } from '../lib/theme'

let current = typeof document !== 'undefined' ? getStoredTheme() : ('ink' as ThemeId)
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((l) => l())
}

function subscribe(listener: () => void) {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot() {
  return current
}

export function useTheme() {
  const theme = useSyncExternalStore(subscribe, getSnapshot, () => 'ink' as ThemeId)

  const setTheme = useCallback((next: ThemeId) => {
    current = next
    applyTheme(next)
    emit()
  }, [])

  return { theme, setTheme }
}

/** Call once at startup before paint when possible. */
export function initTheme() {
  current = getStoredTheme()
  applyTheme(current)

  window.addEventListener('storage', (event) => {
    if (event.key !== 'retain-theme' || !event.newValue || !isThemeId(event.newValue)) return
    if (event.newValue === current) return
    current = event.newValue
    applyTheme(current)
    emit()
  })
}
