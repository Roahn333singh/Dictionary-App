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
    label: 'Midnight',
    description: 'Dark mode, acid lime',
    swatches: ['#101014', '#c6ff3d', '#ff5ec4'],
    themeColor: '#101014',
  },
  {
    id: 'forest',
    label: 'Matcha',
    description: 'Fresh green, light',
    swatches: ['#eef5e4', '#9be15d', '#ff8fcf'],
    themeColor: '#EEF5E4',
  },
  {
    id: 'ember',
    label: 'Sunset',
    description: 'Warm dark, orange pop',
    swatches: ['#1a0f14', '#ff8a3d', '#ff4f9a'],
    themeColor: '#1A0F14',
  },
  {
    id: 'day',
    label: 'Bubblegum',
    description: 'Lilac & pink, light',
    swatches: ['#f3edff', '#ff7ad9', '#6ee7f9'],
    themeColor: '#F3EDFF',
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
