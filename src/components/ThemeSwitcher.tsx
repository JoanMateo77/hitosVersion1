import type { ComponentType } from 'react'
import { THEMES, useTheme } from '@/app/ThemeProvider'
import type { Theme } from '@/app/theme'
import { IconMoon, IconSun, IconSystem } from '@/components/icons'

type Variant = 'compact' | 'stack'

const THEME_ICONS: Record<Theme, ComponentType<{ size?: number }>> = {
  claro: IconSun,
  oscuro: IconMoon,
  sistema: IconSystem,
}

/** Selector de apariencia (claro / oscuro / sistema). */
export function ThemeSwitcher({ variant = 'compact' }: { variant?: Variant }) {
  const { theme, setTheme } = useTheme()

  if (variant === 'stack') {
    return (
      <div className="themeswitch" role="group" aria-label="Tema">
        {THEMES.map((t) => {
          const Icon = THEME_ICONS[t.id]
          return (
            <button
              key={t.id}
              type="button"
              className={`themeswitch__btn${theme === t.id ? ' themeswitch__btn--active' : ''}`}
              aria-pressed={theme === t.id}
              onClick={() => setTheme(t.id)}
            >
              <Icon size={16} /> {t.label}
            </button>
          )
        })}
      </div>
    )
  }

  return (
    <div className="seg" role="group" aria-label="Tema">
      {THEMES.map((t) => {
        const Icon = THEME_ICONS[t.id]
        return (
          <button
            key={t.id}
            type="button"
            className={`seg__btn${theme === t.id ? ' seg__btn--active' : ''}`}
            aria-pressed={theme === t.id}
            onClick={() => setTheme(t.id)}
            title={t.label}
          >
            <Icon size={15} />
            <span className="themeswitch__label">{t.label}</span>
          </button>
        )
      })}
    </div>
  )
}
