import { useEffect, useState, type ComponentType } from 'react'
import { useSession } from '@/app/session'
import { deleteAccount, signOut } from '@/services/auth'
import { updateRhythm } from '@/services/profile'
import { disablePush, enablePush, getPushState } from '@/lib/push'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { IconMoon, IconSun, IconSunrise } from '@/components/icons'
import type { PreferredMoment } from '@/lib/types'

const MOMENTS: { id: PreferredMoment; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'morning', label: 'Mañana', Icon: IconSunrise },
  { id: 'midday', label: 'Mediodía', Icon: IconSun },
  { id: 'evening', label: 'Noche', Icon: IconMoon },
]

export function ProfileScreen() {
  const { userId, email, profile, setProfile } = useSession()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [push, setPush] = useState<'on' | 'off' | 'blocked' | 'unsupported' | 'loading'>('loading')

  useEffect(() => {
    let active = true
    getPushState()
      .then((st) => active && setPush(st))
      .catch(() => active && setPush('unsupported'))
    return () => {
      active = false
    }
  }, [])

  async function togglePush() {
    setError(null)
    try {
      if (push === 'on') {
        setPush('off')
        await disablePush()
      } else {
        await enablePush(userId)
        setPush('on')
      }
    } catch (err) {
      setPush(await getPushState().catch(() => 'unsupported' as const))
      setError(err instanceof Error ? err.message : 'No se pudo cambiar el recordatorio.')
    }
  }

  const initial = (email[0] ?? '?').toUpperCase()
  // Local y optimista: los +/- rápidos no deben leer estado viejo del perfil.
  const [minutes, setMinutes] = useState(profile.defaultSessionMinutes ?? 25)

  async function saveRhythm(patch: {
    preferredMoment?: PreferredMoment | null
    defaultSessionMinutes?: number
  }) {
    setError(null)
    try {
      const updated = await updateRhythm(userId, {
        preferredMoment: patch.preferredMoment !== undefined ? patch.preferredMoment : profile.preferredMoment,
        defaultSessionMinutes:
          patch.defaultSessionMinutes !== undefined ? patch.defaultSessionMinutes : profile.defaultSessionMinutes,
      })
      setProfile(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
    }
  }

  async function handleSignOut() {
    setSigningOut(true)
    setError(null)
    try {
      await signOut()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo cerrar sesión. Inténtalo de nuevo.')
      setSigningOut(false)
    }
  }

  async function handleDelete() {
    setDeleting(true)
    setError(null)
    try {
      await deleteAccount()
      // onAuthChange detecta el cierre de sesión y la app vuelve al login.
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo eliminar la cuenta.')
      setDeleting(false)
      setConfirmDelete(false)
    }
  }

  return (
    <div className="screen">
      <header className="screen__header row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
        <span
          aria-hidden="true"
          style={{
            width: 46,
            height: 46,
            borderRadius: '50%',
            background: 'var(--gradient-brand)',
            color: 'var(--on-primary)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 700,
            fontSize: 18,
            flex: 'none',
          }}
        >
          {initial}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 className="screen__title" style={{ fontSize: 'var(--fs-xl)' }}>
            Perfil
          </h1>
          <p className="muted small nowrap-ellipsis" style={{ margin: 0 }}>
            {email}
          </p>
        </div>
      </header>

      <div className="settings-grid">
      {/* ----- Tu ritmo: defaults que alimentan el wizard y los horarios ----- */}
      <section className="card stack stack--sm" aria-label="Tu ritmo">
        <span className="kicker">Tu ritmo</span>
        <div className="field">
          <span className="field__label">¿Cuándo te es más fácil cumplir?</span>
          <div className="row wrap">
            {MOMENTS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`chip${profile.preferredMoment === m.id ? ' chip--selected' : ''}`}
                aria-pressed={profile.preferredMoment === m.id}
                onClick={() =>
                  void saveRhythm({ preferredMoment: profile.preferredMoment === m.id ? null : m.id })
                }
              >
                <m.Icon size={14} /> {m.label}
              </button>
            ))}
          </div>
          <span className="field__hint">Sugiere la hora de tus sesiones nuevas.</span>
        </div>
        <div className="field">
          <span className="field__label">Sesión por defecto</span>
          <div className="row" style={{ alignItems: 'center' }}>
            <button
              type="button"
              className="iconbtn"
              aria-label="Restar 5 minutos"
              disabled={minutes <= 5}
              onClick={() => {
                const next = Math.max(5, minutes - 5)
                setMinutes(next)
                void saveRhythm({ defaultSessionMinutes: next })
              }}
            >
              −
            </button>
            <strong style={{ minWidth: 76, textAlign: 'center' }}>{minutes} min</strong>
            <button
              type="button"
              className="iconbtn"
              aria-label="Sumar 5 minutos"
              onClick={() => {
                const next = minutes + 5
                setMinutes(next)
                void saveRhythm({ defaultSessionMinutes: next })
              }}
            >
              +
            </button>
          </div>
          <span className="field__hint">El punto de partida al comprometer días nuevos.</span>
        </div>
      </section>

      {/* ----- Recordatorios ----- */}
      <section className="card stack stack--sm" aria-label="Recordatorios">
        <span className="kicker">Recordatorios</span>
        {push === 'unsupported' ? (
          <p className="small muted" style={{ margin: 0 }}>
            Este navegador no soporta recordatorios. En iPhone: instala Lógralo en tu pantalla de
            inicio (Compartir → Añadir a pantalla de inicio) y vuelve aquí.
          </p>
        ) : push === 'blocked' ? (
          <p className="small muted" style={{ margin: 0 }}>
            Bloqueaste las notificaciones para este sitio. Actívalas desde los ajustes del navegador.
          </p>
        ) : (
          <div className="row row--between" style={{ alignItems: 'center' }}>
            <span className="small">
              Recordatorio de sesión
              <span className="field__hint" style={{ display: 'block' }}>
                Te avisamos a la hora de cada sesión con horario.
              </span>
            </span>
            <button
              type="button"
              role="switch"
              aria-checked={push === 'on'}
              className={`btn btn--sm ${push === 'on' ? 'btn--primary' : 'btn--ghost'}`}
              disabled={push === 'loading'}
              onClick={() => void togglePush()}
            >
              {push === 'loading' ? '…' : push === 'on' ? 'Activado' : 'Activar'}
            </button>
          </div>
        )}
      </section>

      {/* ----- Apariencia ----- */}
      <section className="card stack stack--sm" aria-label="Apariencia">
        <span className="kicker">Apariencia</span>
        <ThemeSwitcher variant="compact" />
      </section>

      {/* ----- Cuenta ----- */}
      <section className="card stack stack--sm" aria-label="Cuenta">
        <span className="kicker">Cuenta</span>
        <button className="btn btn--ghost btn--block" onClick={handleSignOut} disabled={signingOut}>
          {signingOut ? 'Cerrando sesión…' : 'Cerrar sesión'}
        </button>
        {!confirmDelete ? (
          <button
            className="btn--link"
            style={{ color: 'var(--danger)', alignSelf: 'center' }}
            onClick={() => setConfirmDelete(true)}
          >
            Eliminar mi cuenta
          </button>
        ) : (
          <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--danger)' }}>
            <strong className="small">¿Eliminar tu cuenta definitivamente?</strong>
            <p className="small muted" style={{ margin: 0 }}>
              Se borran tus metas, sesiones, etapas y todo tu historial. No hay vuelta atrás.
            </p>
            <div className="row wrap">
              <button className="btn btn--danger btn--sm" onClick={handleDelete} disabled={deleting}>
                {deleting ? 'Eliminando…' : 'Sí, eliminar todo'}
              </button>
              <button className="btn btn--ghost btn--sm" onClick={() => setConfirmDelete(false)} disabled={deleting}>
                Cancelar
              </button>
            </div>
          </div>
        )}
      </section>
      </div>

      {error && (
        <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s3)' }}>
          {error}
        </div>
      )}

      <p className="faint tiny center" style={{ marginTop: 'var(--s8)' }}>
        Lógralo es gratis. Si algún día te sirve de verdad, podrás apoyar el proyecto.
      </p>
    </div>
  )
}
