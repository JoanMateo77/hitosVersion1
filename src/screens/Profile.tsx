import { useEffect, useRef, useState, type ComponentType, type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import { deleteAccount, signOut } from '@/services/auth'
import { setDailyDigestTime, updateRhythm, uploadAvatar } from '@/services/profile'
import { disablePush, enablePush, getPushState } from '@/lib/push'
import { ThemeSwitcher } from '@/components/ThemeSwitcher'
import {
  IconBook,
  IconChevronRight,
  IconFlame,
  IconMoon,
  IconProgress,
  IconSun,
  IconSunrise,
} from '@/components/icons'
import { FRAMES } from '@/domain/frames'
import { useStreakFrame } from '@/hooks/useStreakFrame'
import { UserAvatar } from '@/components/UserAvatar'
import { Disclosure } from '@/components/Disclosure'
import { NOVEDADES } from '@/content/novedades'
import { formatLongDate } from '@/lib/date'
import type { PreferredMoment } from '@/lib/types'

const MOMENTS: { id: PreferredMoment; label: string; Icon: ComponentType<{ size?: number }> }[] = [
  { id: 'morning', label: 'Mañana', Icon: IconSunrise },
  { id: 'midday', label: 'Mediodía', Icon: IconSun },
  { id: 'evening', label: 'Noche', Icon: IconMoon },
]

/** Texto del botón de foto según el estado de la subida. */
function photoButtonLabel(uploading: boolean, hasPhoto: boolean): string {
  if (uploading) return 'Subiendo…'
  return hasPhoto ? 'Cambiar foto' : 'Añadir foto'
}

/** Texto del interruptor de recordatorios. */
function pushButtonLabel(push: 'on' | 'off' | 'blocked' | 'unsupported' | 'loading'): string {
  if (push === 'loading') return '…'
  return push === 'on' ? 'Activado' : 'Activar'
}

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
  // el resto de la pantalla no se bloquea). Misma cache que la TopBar.
  const { streak, frame } = useStreakFrame()

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

  async function saveDigest(time: string | null) {
    setError(null)
    try {
      setProfile(await setDailyDigestTime(userId, time))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar el recordatorio diario.')
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
      <header className="screen__header profile-id">
        {/* Decorativo: el email va escrito al lado. */}
        <UserAvatar frame={frame} size="lg" className="profile-id__avatar" />
        <div className="profile-id__text">
          <h1 className="screen__title profile-id__title">Perfil</h1>
          <p className="muted small nowrap-ellipsis" style={{ margin: 0 }}>
            {email}
          </p>
          <div className="profile-id__meta">
            {streak > 0 && (
              <span className="streak-chip">
                <IconFlame size={13} /> Racha de {streak} {streak === 1 ? 'día' : 'días'}
              </span>
            )}
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
              {photoButtonLabel(uploading, Boolean(profile.avatarUrl))}
            </button>
          </div>
        </div>
      </header>

      <div className="settings-grid">
      {/* ----- Progreso y Aprender salieron de la barra inferior (ahora Notas) ----- */}
      <section className="card stack stack--sm" aria-label="Progreso y aprendizaje">
        <h2 className="section-title">Progreso y aprendizaje</h2>
        <div className="profile-links">
          <Link className="profile-link" to="/progreso">
            <span className="profile-link__icon" aria-hidden="true">
              <IconProgress size={20} />
            </span>
            <span className="profile-link__text">
              <strong>Tu progreso</strong>
              <span className="small muted">Racha, metas y camino recorrido</span>
            </span>
            <IconChevronRight size={16} className="profile-link__chev" />
          </Link>
          <Link className="profile-link" to="/aprender">
            <span className="profile-link__icon" aria-hidden="true">
              <IconBook size={20} />
            </span>
            <span className="profile-link__text">
              <strong>Aprender</strong>
              <span className="small muted">Lecciones cortas para tu foco</span>
            </span>
            <IconChevronRight size={16} className="profile-link__chev" />
          </Link>
        </div>
      </section>

      {/* ----- Tu ritmo: defaults que alimentan el wizard y los horarios ----- */}
      <section className="card stack stack--sm" aria-label="Tu ritmo">
        <h2 className="section-title">Tu ritmo</h2>
        <div className="field">
          <span className="field__label">¿Cuándo te es más fácil cumplir?</span>
          <fieldset className="seg profile-moments" aria-label="Momento preferido">
            {MOMENTS.map((m) => (
              <button
                key={m.id}
                type="button"
                className={`seg__btn${profile.preferredMoment === m.id ? ' seg__btn--active' : ''}`}
                aria-pressed={profile.preferredMoment === m.id}
                onClick={() =>
                  void saveRhythm({ preferredMoment: profile.preferredMoment === m.id ? null : m.id })
                }
              >
                <m.Icon size={14} /> {m.label}
              </button>
            ))}
          </fieldset>
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
        </div>
      </section>

      {/* ----- Tu marco: identidad de constancia (racha de días comprometidos) ----- */}
      <section className="card stack stack--sm" aria-label="Tu marco">
        <h2 className="section-title">Tu marco</h2>
        <p className="small" style={{ margin: 0 }}>
          Racha actual: <strong>{streak} {streak === 1 ? 'día cumplido' : 'días cumplidos'}</strong>
          {frame && (
            <>
              {' · '}marco{' '}
              {/* El color del marco va en el punto; el texto, siempre en --text. */}
              <span
                className="profile-frame-dot"
                aria-hidden="true"
                style={{ '--frame-color': frame.color } as CSSProperties}
              />
              <strong>{frame.label}</strong>
            </>
          )}
        </p>
        <Disclosure summary="Cómo se ganan los marcos">
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
        </Disclosure>
        <Disclosure summary="Novedades">
          <div className="stack">
            {NOVEDADES.map((n) => (
              <div key={n.id} className="stack stack--sm">
                <span className="small">
                  <strong>{n.titulo}</strong> <span className="faint tiny">· {formatLongDate(n.id)}</span>
                </span>
                <ul className="novedades__list small muted">
                  {n.items.map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </Disclosure>
      </section>

      {/* ----- Recordatorios ----- */}
      <section className="card stack stack--sm" aria-label="Recordatorios">
        <h2 className="section-title">Recordatorios</h2>
        {push === 'unsupported' && (
          <div className="stack stack--sm">
            <p className="small muted" style={{ margin: 0 }}>Este navegador no permite notificaciones.</p>
            <Disclosure summary="¿Cómo activarlos en iPhone?">
              <p className="small muted" style={{ margin: 0 }}>
                Los recordatorios te avisan a la hora de cada sesión. En iPhone la solución toma 10
                segundos: abre Lógralo en Safari, toca{' '}
                <strong>Compartir → Añadir a pantalla de inicio</strong>, y ábrela desde ese icono —
                funciona como una app y los recordatorios se activan aquí mismo.
              </p>
              <p className="faint tiny" style={{ margin: 0 }}>
                Las apps nativas para celular y computador están en camino; por ahora la versión
                instalada desde el navegador es la experiencia completa.
              </p>
            </Disclosure>
          </div>
        )}
        {push === 'blocked' && (
          <p className="small muted" style={{ margin: 0 }}>
            Bloqueaste las notificaciones para este sitio. Actívalas desde los ajustes del navegador.
          </p>
        )}
        {push !== 'unsupported' && push !== 'blocked' && (
          <div className="row row--between" style={{ alignItems: 'center' }}>
            <span className="small">
              {'Recordatorio de sesión'}
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
              {pushButtonLabel(push)}
            </button>
          </div>
        )}
        {push === 'on' && (
          <div className="row row--between" style={{ alignItems: 'center' }}>
            <span className="small">
              Recordatorio diario de tus metas{' '}
              <span className="field__hint" style={{ display: 'block' }}>
                Un aviso al día con tus metas activas y las sesiones de hoy.
              </span>
            </span>
            <div className="row" style={{ alignItems: 'center', gap: 'var(--space-2, 8px)' }}>
              {profile.dailyDigestTime && (
                <input
                  type="time"
                  className="input"
                  aria-label="Hora del recordatorio diario"
                  defaultValue={profile.dailyDigestTime}
                  onBlur={(e) => {
                    const v = e.target.value
                    if (/^\d{2}:\d{2}$/.test(v) && v !== profile.dailyDigestTime) void saveDigest(v)
                  }}
                />
              )}
              <button
                type="button"
                role="switch"
                aria-checked={profile.dailyDigestTime !== null}
                className={`btn btn--sm ${profile.dailyDigestTime ? 'btn--primary' : 'btn--ghost'}`}
                onClick={() => void saveDigest(profile.dailyDigestTime ? null : '07:30')}
              >
                {profile.dailyDigestTime ? 'Activado' : 'Activar'}
              </button>
            </div>
          </div>
        )}
      </section>

      {/* ----- Apariencia (solo móvil: en escritorio el tema vive en la barra lateral) ----- */}
      <section className="card stack stack--sm hide-on-desktop" aria-label="Apariencia">
        <h2 className="section-title">Apariencia</h2>
        <ThemeSwitcher variant="compact" />
      </section>

      {/* ----- Cuenta ----- */}
      <section className="card stack stack--sm" aria-label="Cuenta">
        <h2 className="section-title">Cuenta</h2>
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

      {/* ----- Acerca de ----- */}
      <p className="faint tiny profile-foot">
        Lógralo · Desarrollado por Seki Software
      </p>
      </div>

      {error && (
        <div className="alert alert--error" role="alert" style={{ marginTop: 'var(--s3)' }}>
          {error}
        </div>
      )}
    </div>
  )
}
