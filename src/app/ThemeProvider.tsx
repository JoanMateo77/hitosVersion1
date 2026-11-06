import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'
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
export function ThemeProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(readTheme)
  const changeTheme = useCallback((next: Theme) => {
    setTheme(next)
    applyTheme(next)
  }, [])
  // En modo Sistema, seguir los cambios de apariencia del SO en vivo.
  useEffect(() => {
    if (theme !== 'sistema') return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => applyTheme('sistema')
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [theme])
  const value = useMemo(() => ({ theme, setTheme: changeTheme }), [theme, changeTheme])
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext)
  if (!ctx) throw new Error('useTheme debe usarse dentro de <ThemeProvider>')
  return ctx
}

export { THEMES, type Theme } from '@/app/theme'
