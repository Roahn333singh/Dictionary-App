export type ThemeId = 'ink' | 'forest' | 'ember' | 'day'

export type ThemeOption = {
  id: ThemeId
  label: string
  description: string
  swatches: [string, string, string]
  themeColor: string
}

export const THEMES: ThemeOption[] = [
  {
    id: 'ink',
    label: 'Ink',
    description: 'Deep navy & gold',
    swatches: ['#0a1628', '#f2c14e', '#7dcfb6'],
    themeColor: '#0A1628',
  },
  {
    id: 'forest',
    label: 'Forest',
    description: 'Moss & amber',
    swatches: ['#0c1a14', '#e2b15a', '#6fcf9c'],
    themeColor: '#0C1A14',
  },
  {
    id: 'ember',
    label: 'Ember',
    description: 'Charcoal & rose',
    swatches: ['#1a1214', '#f0a07a', '#e8c4b8'],
    themeColor: '#1A1214',
  },
  {
    id: 'day',
    label: 'Day',
    description: 'Soft light & ink',
    swatches: ['#e8eef6', '#184e77', '#0f766e'],
    themeColor: '#E8EEF6',
  },
]

const STORAGE_KEY = 'retain-theme'

export function isThemeId(value: string): value is ThemeId {
  return THEMES.some((t) => t.id === value)
}

export function getStoredTheme(): ThemeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (raw && isThemeId(raw)) return raw
  } catch {
    // ignore
  }
  return 'ink'
}

export function applyTheme(theme: ThemeId) {
  document.documentElement.setAttribute('data-theme', theme)
  const meta = document.querySelector('meta[name="theme-color"]')
  const option = THEMES.find((t) => t.id === theme)
  if (meta && option) meta.setAttribute('content', option.themeColor)
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    // ignore
  }
}
