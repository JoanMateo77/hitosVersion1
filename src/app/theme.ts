export type Theme = 'claro' | 'neon' | 'negro'

const STORAGE_KEY = 'hito-theme'

/** Color de la barra del sistema por tema (debe coincidir con index.html). */
const THEME_COLOR: Record<Theme, string> = {
  claro: '#f5f0e6',
  neon: '#05060f',
  negro: '#000000',
}

export const THEMES: { id: Theme; label: string; emoji: string }[] = [
  { id: 'claro', label: 'Claro', emoji: '☀️' },
  { id: 'negro', label: 'Negro', emoji: '🌑' },
  { id: 'neon', label: 'Neón', emoji: '✨' },
]

function isTheme(value: string | null): value is Theme {
  return value === 'claro' || value === 'neon' || value === 'negro'
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isTheme(v)) return v
    // Migración: usuarios con tema "oscuro" guardado caen a claro (el doc no lo tiene
    // como tema vigente; el neón se ofrece como alternativa nocturna).
    if (v === 'oscuro') return 'claro'
  } catch {
    /* localStorage no disponible */
  }
  return 'claro'
}

/** Aplica el tema al documento (atributo + barra del sistema) y lo persiste. */
export function applyTheme(theme: Theme): void {
  document.documentElement.dataset.theme = theme
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  const metas = document.querySelectorAll('meta[name="theme-color"]')
  metas.forEach((m) => m.setAttribute('content', THEME_COLOR[theme]))
}
