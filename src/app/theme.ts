import { useState } from 'react'

export type Theme = 'claro' | 'oscuro' | 'neon'

const STORAGE_KEY = 'hito-theme'

/** Color de la barra del sistema por tema (debe coincidir con index.html). */
const THEME_COLOR: Record<Theme, string> = {
  claro: '#eef1f8',
  oscuro: '#0b1220',
  neon: '#05060f',
}

export const THEMES: { id: Theme; label: string; emoji: string }[] = [
  { id: 'claro', label: 'Claro', emoji: '☀️' },
  { id: 'oscuro', label: 'Oscuro', emoji: '🌙' },
  { id: 'neon', label: 'Neón', emoji: '✨' },
]

function isTheme(value: string | null): value is Theme {
  return value === 'claro' || value === 'oscuro' || value === 'neon'
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isTheme(v)) return v
  } catch {
    /* localStorage no disponible */
  }
  return 'oscuro'
}

/** Aplica el tema al documento (atributo + barra del sistema) y lo persiste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', THEME_COLOR[theme])
}

/** Hook para leer y cambiar el tema (claro / oscuro / neón). */
export function useTheme(): { theme: Theme; setTheme: (t: Theme) => void } {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  function setTheme(next: Theme) {
    setThemeState(next)
    applyTheme(next)
  }
  return { theme, setTheme }
}
