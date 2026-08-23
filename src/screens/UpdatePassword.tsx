import { useState, type FormEvent } from 'react'
import { updatePassword } from '@/services/auth'
import { IconHito } from '@/components/icons'

/**
 * El enlace de "olvidé mi contraseña" inicia sesión pero no la cambia: esta
 * pantalla cierra el ciclo pidiendo la contraseña nueva antes de soltar al
 * usuario en la app. "Ahora no" deja pasar (la sesión ya es válida).
 */
export function UpdatePassword({ onDone }: { onDone: () => void }) {
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [show, setShow] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    // Coincidencia validada ANTES de ir al servidor, igual que en el registro.
    if (password !== confirm) {
      setError('Las contraseñas no coinciden.')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await updatePassword(password)
      onDone()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="screen screen--full flow-screen" style={{ justifyContent: 'center' }}>
      <form
        className="stack stack--lg"
        style={{ width: 'min(380px, 100%)', margin: '0 auto' }}
        onSubmit={handleSubmit}
      >
        <header className="center stack stack--sm" style={{ alignItems: 'center' }}>
          <span className="brand__mark" style={{ color: 'var(--primary)' }}>
            <IconHito size={56} />
          </span>
          <h1 className="screen__title">Define tu contraseña nueva</h1>
          <p className="muted small center">
            Entraste con el enlace de recuperación. Elige la contraseña que usarás de ahora en más.
          </p>
        </header>
        <div className="field">
          <div className="row row--between" style={{ alignItems: 'baseline' }}>
            <label className="field__label" htmlFor="new-password">
              Contraseña nueva
            </label>
            <button
              type="button"
              className="btn--link tiny"
              aria-pressed={show}
              onClick={() => setShow((s) => !s)}
            >
              {show ? 'Ocultar' : 'Mostrar'}
            </button>
          </div>
          <input
            id="new-password"
            className="input"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="Mínimo 6 caracteres"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoFocus
          />
        </div>
        <div className="field">
          <label className="field__label" htmlFor="confirm-password">
            Repite la contraseña
          </label>
          <input
            id="confirm-password"
            className="input"
            type={show ? 'text' : 'password'}
            autoComplete="new-password"
            placeholder="La misma de arriba"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            required
            minLength={6}
          />
        </div>
        {error && (
          <div className="alert alert--error" role="alert">
            {error}
          </div>
        )}
        <button className="btn btn--primary btn--block" type="submit" disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar contraseña nueva'}
        </button>
        <button type="button" className="btn--link" style={{ alignSelf: 'center' }} onClick={onDone}>
          Ahora no
        </button>
      </form>
    </div>
  )
}
