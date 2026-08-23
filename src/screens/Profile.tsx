import { useEffect, useRef, useState, type ComponentType } from 'react'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { deleteAccount, signOut } from '@/services/auth'
import { fetchCurrentStreak, updateRhythm, uploadAvatar } from '@/services/profile'
import { disablePush, enablePush, getPushState } from '@/lib/push'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import { IconMoon, IconSun, IconSunrise } from '@/components/icons'
import { FRAMES, frameForStreak } from '@/domain/frames'
import { useCachedData } from '@/hooks/useCachedData'
import type { PreferredMoment } from '@/lib/types'

const MOMENTS: { id: PreferredMoment; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'morning', label: 'Mañana', Icon: IconSunrise },
  { id: 'midday', label: 'Mediodía', Icon: IconSun },
  { id: 'evening', label: 'Noche', Icon: IconMoon },
]

export function ProfileScreen() {
  const { userId, email, profile, setProfile } = useSession()
  const { toast } = useToast()
  const [signingOut, setSigningOut] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [push, setPush] = useState<'on' | 'off' | 'blocked' | 'unsupported' | 'loading'>('loading')
  const [uploading, setUploading] = useState(false)
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Racha con la misma métrica que Progreso; tolerante a errores (queda en 0,
  // el resto de la pantalla no se bloquea). Misma clave de cache que la TopBar.
  const { data: streakData } = useCachedData(
    `streak:${userId}`,
    () => fetchCurrentStreak(userId).catch(() => 0),
    [userId],
  )
  const streak = streakData ?? 0
  const frame = frameForStreak(streak)

  async function handleAvatarFile(file: File | undefined) {
    if (!file || uploading) return
    setUploading(true)
    try {
      const updated = await uploadAvatar(userId, file)
      setProfile(updated)
      toast('Foto actualizada', 'success')
    } catch (err) {
      toast(err instanceof Error ? err.message : 'No se pudo subir la foto.', 'warning')
    } finally {
      setUploading(false)
      // Permite volver a elegir el mismo archivo si el usuario reintenta.
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

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
            overflow: 'hidden',
            // El marco ganado con la racha se pinta como anillo alrededor.
            boxShadow: frame ? `0 0 0 3px ${frame.color}` : undefined,
          }}
        >
          {profile.avatarUrl ? (
            <img
              src={profile.avatarUrl}
              alt=""
              style={{ width: '100%', height: '100%', objectFit: 'cover', borderRadius: '50%' }}
            />
          ) : (
            initial
          )}
        </span>
        <div style={{ minWidth: 0 }}>
          <h1 className="screen__title" style={{ fontSize: 'var(--fs-xl)' }}>
            Perfil
          </h1>
          <p className="muted small nowrap-ellipsis" style={{ margin: 0 }}>
            {email}
          </p>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            hidden
            onChange={(e) => void handleAvatarFile(e.target.files?.[0])}
          />
          <button
            type="button"
            className="btn--link small"
            style={{ padding: 0 }}
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {uploading ? 'Subiendo…' : profile.avatarUrl ? 'Cambiar foto' : 'Añadir foto'}
          </button>
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

      {/* ----- Tu marco: identidad de constancia (racha de días comprometidos) ----- */}
      <section className="card stack stack--sm" aria-label="Tu marco">
        <span className="kicker">Tu marco</span>
        <p className="small" style={{ margin: 0 }}>
          Racha actual: <strong>{streak} {streak === 1 ? 'día cumplido' : 'días cumplidos'}</strong>
          {frame && (
            <>
              {' · '}marco <strong style={{ color: frame.color }}>{frame.label}</strong>
            </>
          )}
        </p>
        <div className="row wrap" style={{ gap: 'var(--s4)' }}>
          {FRAMES.map((f) => {
            const earned = streak >= f.minStreak
            return (
              <div
                key={f.id}
                className="stack"
                style={{ alignItems: 'center', gap: 4, opacity: earned ? 1 : 0.35 }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: '50%',
                    background: 'var(--surface-2)',
                    boxShadow: `0 0 0 3px ${f.color}`,
                  }}
                />
                <span className="tiny" style={{ fontWeight: 600 }}>
                  {f.label}
                </span>
                <span className="faint tiny">
                  {earned ? `${f.minStreak}+ días` : `a ${f.minStreak} días`}
                </span>
              </div>
            )
          })}
        </div>
        <p className="field__hint" style={{ margin: 0 }}>
          El marco se gana cumpliendo tus días comprometidos y rodea tu foto en toda la app. Si la
          racha se corta, el marco se pierde: refleja tu constancia de hoy, no tu récord histórico.
        </p>
      </section>

      {/* ----- Recordatorios ----- */}
      <section className="card stack stack--sm" aria-label="Recordatorios">
        <span className="kicker">Recordatorios</span>
        {push === 'unsupported' ? (
          <div className="stack stack--sm">
            <p className="small muted" style={{ margin: 0 }}>
              Los recordatorios te avisan a la hora de cada sesión, pero este navegador no permite
              notificaciones. En iPhone la solución toma 10 segundos: abre Lógralo en Safari, toca{' '}
              <strong>Compartir → Añadir a pantalla de inicio</strong>, y ábrela desde ese icono —
              funciona como una app y los recordatorios se activan aquí mismo.
            </p>
            <p className="faint tiny" style={{ margin: 0 }}>
              Las apps nativas para celular y computador están en camino; por ahora la versión
              instalada desde el navegador es la experiencia completa.
            </p>
          </div>
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

      {/* ----- Apariencia (solo móvil: en escritorio el tema vive en la barra lateral) ----- */}
      <section className="card stack stack--sm hide-on-desktop" aria-label="Apariencia">
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
