export type Theme = 'claro' | 'oscuro' | 'sistema'

const STORAGE_KEY = 'hito-theme'

/** Color de la barra del sistema por variante (debe coincidir con index.html). */
const THEME_COLOR: Record<'claro' | 'oscuro', string> = {
  claro: '#faf5ec',
  oscuro: '#121110',
}

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'claro', label: 'Claro' },
  { id: 'oscuro', label: 'Oscuro' },
  { id: 'sistema', label: 'Sistema' },
]

function isTheme(value: string | null): value is Theme {
  return value === 'claro' || value === 'oscuro' || value === 'sistema'
}

/** La variante visual concreta que corresponde a la elección del usuario. */
export function resolveTheme(theme: Theme): 'claro' | 'oscuro' {
  if (theme !== 'sistema') return theme
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'oscuro' : 'claro'
  } catch {
    return 'claro'
  }
}

export function readTheme(): Theme {
  try {
    const v = localStorage.getItem(STORAGE_KEY)
    if (isTheme(v)) return v
    // Migración de los temas viejos: negro y neón eran oscuros.
    if (v === 'negro' || v === 'neon') return 'oscuro'
  } catch {
    /* localStorage no disponible */
  }
  return 'sistema'
}

/** Aplica el tema al documento (atributo + barra del sistema) y lo persiste. */
export function applyTheme(theme: Theme): void {
  const resolved = resolveTheme(theme)
  document.documentElement.dataset.theme = resolved
  try {
    localStorage.setItem(STORAGE_KEY, theme)
  } catch {
    /* ignore */
  }
  const metas = document.querySelectorAll('meta[name="theme-color"]')
  metas.forEach((m) => m.setAttribute('content', THEME_COLOR[resolved]))
}
