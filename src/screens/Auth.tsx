import { useState, type FormEvent } from 'react'
import { resendConfirmation, resetPassword, signIn, signInWithGoogle, signUp } from '@/services/auth'
import { IconHito } from '@/components/icons'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'

type Mode = 'signin' | 'signup' | 'reset'

/** Logo oficial multicolor de la G de Google (los términos de marca piden no recolorearlo). */
function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    </svg>
  )
}

export function Auth() {
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPassword, setShowPassword] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  // Ofrecer reenviar el correo de confirmación cuando el usuario queda atrapado:
  // acaba de registrarse (perdió el email) o intenta entrar sin haberlo confirmado.
  const [showResend, setShowResend] = useState(false)
  const [confirmPassword, setConfirmPassword] = useState('')
  const [oauthLoading, setOauthLoading] = useState(false)

  const isSignup = mode === 'signup'
  const isReset = mode === 'reset'

  async function handleGoogle() {
    setError(null)
    setNotice(null)
    setOauthLoading(true)
    try {
      // Redirige a Google; si sale bien esta página se abandona, así que el
      // loading solo se apaga en el camino de error.
      await signInWithGoogle()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo entrar con Google.')
      setOauthLoading(false)
    }
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setNotice(null)
    setShowResend(false)
    // Vista de recuperación: el submit envía el enlace, no intenta entrar.
    if (isReset) {
      await handleReset()
      return
    }
    // Al crear la cuenta, confirmamos que ambas contraseñas coincidan ANTES de
    // enviar: así el error de tipeo se atrapa en el acto, no tras un viaje al
    // servidor con un mensaje confuso.
    if (isSignup && password !== confirmPassword) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setLoading(true)
    try {
      if (isSignup) {
        const { needsConfirmation } = await signUp(email.trim(), password)
        // Solo avisamos si de verdad quedó pendiente de confirmar email; si el login
        // es inmediato, useAuth mete al usuario a la app sin un aviso a medias.
        if (needsConfirmation) {
          setNotice('Listo, tu cuenta está creada. Revisa tu casilla para confirmar el email.')
          setShowResend(true)
        }
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Algo salió mal. Inténtalo de nuevo.'
      setError(message)
      if (message.includes('Confirma tu email')) setShowResend(true)
    } finally {
      setLoading(false)
    }
  }

  async function handleResend() {
    const target = email.trim()
    if (!target) {
      setError('Escribe tu email arriba para reenviar la confirmación.')
      return
    }
    setError(null)
    setNotice(null)
    setLoading(true)
    try {
      await resendConfirmation(target)
      setNotice('Te reenviamos el correo de confirmación. Revisa tu casilla.')
      setShowResend(false)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo reenviar el correo.')
    } finally {
      setLoading(false)
    }
  }

  async function handleReset() {
    const target = email.trim()
    setLoading(true)
    try {
      await resetPassword(target)
      setNotice(
        `Enlace enviado a ${target}. Ábrelo desde este dispositivo y te pedirá tu contraseña nueva. Si no llega en unos minutos, revisa spam o vuelve a enviarlo.`,
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo enviar el email.')
    } finally {
      setLoading(false)
    }
  }

  function goTo(next: Mode) {
    setMode(next)
    setError(null)
    setNotice(null)
    setShowResend(false)
    setConfirmPassword('')
  }

  function switchMode() {
    goTo(isSignup ? 'signin' : 'signup')
  }

  return (
    <div className="screen screen--full auth-screen">
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
        <h1 className="auth-hero__headline">Tu meta, con un compromiso real.</h1>
        <p className="auth-hero__lede">
          La app que convierte tus metas en un plan diario: horarios reales, progreso visible y
          constancia sin culpa.
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
            Tu meta, con un compromiso real.
          </p>
        </header>

        <div className="auth-form-card">
          <form className="stack stack--lg" onSubmit={handleSubmit}>
            <h1 className="auth-form__title">
              {isReset ? 'Recupera tu contraseña' : isSignup ? 'Crea tu cuenta' : 'Entra'}
            </h1>

            {isReset && (
              <p className="muted small" style={{ margin: 0 }}>
                Escribe el email de tu cuenta y te enviamos un enlace para definir una contraseña
                nueva.
              </p>
            )}

            {/* OAuth primero: un toque y adentro. El mismo botón sirve para entrar
                y para crear la cuenta (Google no distingue: si no existe, la crea). */}
            {!isReset && (
              <>
                <button
                  type="button"
                  className="btn btn--ghost btn--block"
                  disabled={loading || oauthLoading}
                  onClick={() => void handleGoogle()}
                >
                  <GoogleLogo />
                  {oauthLoading
                    ? 'Abriendo Google…'
                    : isSignup
                      ? 'Crear cuenta con Google'
                      : 'Continuar con Google'}
                </button>
                <div className="auth-divider" aria-hidden="true">
                  <span>o con tu email</span>
                </div>
              </>
            )}

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
                placeholder="tu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>

            {!isReset && (
            <div className="field">
              <div className="row row--between" style={{ alignItems: 'baseline' }}>
                <label className="field__label" htmlFor="password">
                  Contraseña
                </label>
                {/* Ver la contraseña evita el error más común al escribirla a ciegas,
                    sobre todo al crear la cuenta. */}
                <button
                  type="button"
                  className="btn--link tiny"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-pressed={showPassword}
                >
                  {showPassword ? 'Ocultar' : 'Mostrar'}
                </button>
              </div>
              <input
                id="password"
                className="input"
                type={showPassword ? 'text' : 'password'}
                autoComplete={isSignup ? 'new-password' : 'current-password'}
                placeholder={isSignup ? 'Mínimo 6 caracteres' : 'Tu contraseña'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
              />
            </div>
            )}

            {isSignup && (
              <div className="field">
                <label className="field__label" htmlFor="confirm-password">
                  Repite tu contraseña
                </label>
                <input
                  id="confirm-password"
                  className="input"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="new-password"
                  placeholder="La misma de arriba"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  minLength={6}
                />
                {confirmPassword.length > 0 && confirmPassword !== password && (
                  <p className="field__hint tiny" style={{ color: 'var(--warning)', margin: 'var(--s1) 0 0' }}>
                    Las contraseñas no coinciden todavía.
                  </p>
                )}
              </div>
            )}

            {mode === 'signin' && (
              <button
                type="button"
                className="btn--link"
                style={{ alignSelf: 'flex-end' }}
                onClick={() => goTo('reset')}
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
            {showResend && (
              <button
                type="button"
                className="btn--link"
                style={{ alignSelf: 'center' }}
                onClick={handleResend}
                disabled={loading}
              >
                Reenviar correo de confirmación
              </button>
            )}

            <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
              {loading
                ? isReset
                  ? 'Enviando…'
                  : isSignup
                    ? 'Creando cuenta…'
                    : 'Entrando…'
                : isReset
                  ? notice
                    ? 'Volver a enviar el enlace'
                    : 'Enviarme el enlace'
                  : isSignup
                    ? 'Crear cuenta'
                    : 'Entrar'}
            </button>
          </form>

          <p className="center muted" style={{ marginTop: 'var(--s5)' }}>
            {isReset ? (
              <button type="button" className="btn--link" onClick={() => goTo('signin')}>
                ← Volver a entrar
              </button>
            ) : (
              <>
                {isSignup ? '¿Ya tienes cuenta?' : '¿Primera vez?'}{' '}
                <button type="button" className="btn--link" onClick={switchMode}>
                  {isSignup ? 'Entra' : 'Crea tu cuenta'}
                </button>
              </>
            )}
          </p>
        </div>

        {/* Apariencia al pie, donde no compite con la marca ni con el formulario. */}
        <div className="auth__theme">
          <ThemeSwitcher variant="compact" />
        </div>
      </div>
    </div>
  )
}
