import { THEMES, useTheme } from '@/app/ThemeProvider'

type Variant = 'compact' | 'stack'

/** Selector de tema reutilizable (claro / oscuro / neón). */
export function ThemeSwitcher({ variant = 'compact' }: { variant?: Variant }) {
  const { theme, setTheme } = useTheme()

  if (variant === 'stack') {
    return (
      <div className="themeswitch" role="group" aria-label="Tema">
        {THEMES.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`themeswitch__btn${theme === t.id ? ' themeswitch__btn--active' : ''}`}
            aria-pressed={theme === t.id}
            onClick={() => setTheme(t.id)}
          >
            <span aria-hidden="true">{t.emoji}</span> {t.label}
          </button>
        ))}
      </div>
    )
  }

  return (
    <div className="seg" role="group" aria-label="Tema">
      {THEMES.map((t) => (
        <button
          key={t.id}
          type="button"
          className={`seg__btn${theme === t.id ? ' seg__btn--active' : ''}`}
          aria-pressed={theme === t.id}
          onClick={() => setTheme(t.id)}
          title={t.label}
        >
          <span aria-hidden="true">{t.emoji}</span>
          <span className="themeswitch__label"> {t.label}</span>
        </button>
      ))}
    </div>
  )
}
