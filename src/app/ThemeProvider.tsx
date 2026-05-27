import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'
import { applyTheme, readTheme, type Theme } from '@/app/theme'

interface ThemeContextValue {
  theme: Theme
  setTheme: (t: Theme) => void
}

const ThemeContext = createContext<ThemeContextValue | null>(null)

/**
 * Estado de tema compartido por toda la app: un único useState fuente de verdad,
 * así todos los selectores (sidebar, top bar, perfil, login) quedan en sincronía.
 * El tema inicial ya lo aplica el script inline de index.html (sin parpadeo).
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const setTheme = useCallback((next: Theme) => {
    setThemeState(next)
    applyTheme(next)
  }, [])
  return <ThemeContext.Provider value={{ theme, setTheme }}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}

export { THEMES, type Theme } from '@/app/theme'
