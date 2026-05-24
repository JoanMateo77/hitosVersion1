import { useState, type FormEvent } from 'react'
import { signIn, signUp } from '@/services/auth'
import { IconHito } from '@/components/icons'

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
        await signUp(email.trim(), password)
        // Si la confirmación de email está desactivada, el login es inmediato
        // (useAuth detecta la sesión). Si está activada, queda este aviso.
        setNotice('Cuenta creada. Si tu proyecto pide confirmar el email, revisá tu correo.')
      } else {
        await signIn(email.trim(), password)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Algo salió mal. Probá de nuevo.')
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
    <div className="screen screen--full">
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
        <header className="center stack stack--sm" style={{ marginBottom: 'var(--s8)' }}>
          <div className="brand" style={{ justifyContent: 'center', fontSize: 'var(--fs-2xl)' }}>
            <span className="brand__mark">
              <IconHito size={26} />
            </span>
            Hito
          </div>
          <p className="muted">Un hito por día hacia lo que te proponés.</p>
        </header>

        <form className="stack stack--lg" onSubmit={handleSubmit}>
          <h1 style={{ fontSize: 'var(--fs-xl)' }}>{isSignup ? 'Creá tu cuenta' : 'Entrá'}</h1>

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

          {error && <div className="alert alert--error">{error}</div>}
          {notice && (
            <div className="alert" style={{ background: 'var(--success-soft)', color: 'var(--success)' }}>
              {notice}
            </div>
          )}

          <button className="btn btn--primary btn--block" type="submit" disabled={loading}>
            {loading ? 'Un momento…' : isSignup ? 'Crear cuenta' : 'Entrar'}
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
  )
}
