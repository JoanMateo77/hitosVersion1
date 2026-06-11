import { useState, type FormEvent } from 'react'
import { resetPassword, signIn, signUp } from '@/services/auth'
import { IconHito } from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

type Mode = 'signin' | 'signup'

export function Auth() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const isSignup = mode === 'signup'

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUp(email.trim(), password)
        // Solo avisamos si de verdad quedó pendiente de confirmar email; si el login
        // es inmediato, useAuth mete al usuario a la app sin un aviso a medias.
        if (needsConfirmation) {
          setNotice('Listo, tu cuenta está creada. Revisá tu casilla para confirmar el email.')
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal. Probá de nuevo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    const target = email.trim()
    if (!target) {
      setError('Escribí tu email arriba para recuperar tu contraseña.')
      return
    }
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      await resetPassword(target)
      setNotice('Te mandamos un email para recuperar tu contraseña. Revisá tu casilla.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el email.')
    } finally {
      setLoading(false)
    }
  }

  function switchMode() {
    setMode(isSignup ? 'signin' : 'signup')
    setError(null)
    setNotice(null)
  }

  return (
    <div className="screen screen--full auth-screen">
      <div className="auth__theme">
        <ThemeSwitcher variant="compact" />
      </div>

      {/* Camino decorativo: en mobile cruza toda la pantalla; en desktop vive en
          la columna izquierda del hero, más amplio y expresivo. */}
      <svg
        className="auth__trail"
        viewBox="0 0 400 720"
        preserveAspectRatio="xMidYMid slice"
        aria-hidden="true"
      >
        <path
          d="M -40 580 C 100 540, 140 420, 240 380 S 360 220, 440 140"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeDasharray="2 6"
          opacity="0.35"
        />
        <circle cx="60" cy="560" r="5" fill="currentColor" opacity="0.5" />
        <circle cx="240" cy="380" r="6" fill="currentColor" opacity="0.6" />
        <circle cx="430" cy="148" r="11" fill="currentColor" />
        <circle cx="430" cy="148" r="4" fill="var(--bg)" />
      </svg>

      {/* Hero editorial — sólo visible en desktop ≥1024px. */}
      <aside className="auth-hero">
        <span className="brand__mark auth-hero__mark" style={{ color: 'var(--primary)' }}>
          <IconHito size={96} animate />
        </span>
        <span className="brand auth-hero__brand">Lógralo</span>
        <h1 className="auth-hero__headline">Un hito por día hacia lo que te proponés.</h1>
        <p className="auth-hero__lede">
          Definí tu meta, te armo el plan diario, y avanzás un paso a la vez. Sin apps de hábitos
          genéricas. Tu camino, claro.
        </p>
      </aside>

      <div className="auth-form-wrap">
        <header className="auth-form__brand center stack stack--sm">
          <span className="brand__mark auth__brand-mark" style={{ color: 'var(--primary)' }}>
            <IconHito size={72} animate />
          </span>
          <span
            className="brand"
            style={{ justifyContent: 'center', fontSize: 'var(--fs-3xl)', marginTop: 'var(--s2)' }}
          >
            Lógralo
          </span>
          <p className="muted" style={{ fontFamily: 'var(--font-display)', fontSize: 'var(--fs-lg)' }}>
            Un hito por día hacia lo que te proponés.
          </p>
        </header>

        <div className="auth-form-card">
          <form className="stack stack--lg" onSubmit={handleSubmit}>
            <h1 className="auth-form__title">{isSignup ? 'Creá tu cuenta' : 'Entrá'}</h1>

            <div className="field">
              <label className="field__label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                className="input"
                type="email"
                inputMode="email"
                autoComplete="email"
                autoCapitalize="none"
                spellCheck={false}
                placeholder="vos@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            <div className="field">
              <label className="field__label" htmlFor="password">
                Contraseña
              </label>
              <input
                id="password"
                className="input"
                type="password"
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>

            {!isSignup && (
              <button
                type="button"
                className="btn--link"
                style={{ alignSelf: 'flex-end' }}
                onClick={handleReset}
                disabled={loading}
              >
                ¿Olvidaste tu contraseña?
              </button>
            )}

            {error && <div className="alert alert--error" role="alert">{error}</div>}
            {notice && (
              <div className="alert alert--success" role="status" aria-live="polite">
                {notice}
              </div>
            )}

            <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
              {loading ? (isSignup ? 'Creando cuenta…' : 'Entrando…') : isSignup ? 'Crear cuenta' : 'Entrar'}
            </button>
          </form>

          <p className="center muted" style={{ marginTop: 'var(--s5)' }}>
            {isSignup ? '¿Ya tenés cuenta?' : '¿Primera vez?'}{' '}
            <button type="button" className="btn--link" onClick={switchMode}>
              {isSignup ? 'Entrá' : 'Creá tu cuenta'}
            </button>
          </p>
        </div>
      </div>
    </div>
  )
}
