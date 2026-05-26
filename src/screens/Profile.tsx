import { useState } from 'react'
import { useSession } from '@/app/session'
import { signOut } from '@/services/auth'
import { updateProfilePrefs } from '@/services/profile'
import { NICHES, getNiche } from '@/domain/niches'
import type { FocusMode, NicheId, Profile } from '@/lib/types'

const FOCUS_LABEL: Record<string, string> = {
  single: 'Una meta (modo enfocado)',
  multi: 'Varias metas en paralelo',
}

export function ProfileScreen() {
  const { userId, email, profile, setProfile } = useSession()
  const [editing, setEditing] = useState(false)
  const [signingOut, setSigningOut] = useState(false)

  const niche = profile.primaryNiche ? getNiche(profile.primaryNiche) : null

  async function handleSignOut() {
    setSigningOut(true)
    try {
      await signOut()
      // useAuth detecta el cambio de sesión y App vuelve al login.
    } catch {
      setSigningOut(false)
    }
  }

  return (
    <div className="screen">
      <header className="row row--between screen__header">
        <h1 className="screen__title">Perfil</h1>
        {!editing && (
          <button className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>
            Editar
          </button>
        )}
      </header>

      {editing ? (
        <ProfileEditor
          userId={userId}
          initialFocus={profile.focusMode}
          initialNiche={profile.primaryNiche ?? 'otra'}
          onCancel={() => setEditing(false)}
          onSaved={(p) => {
            setProfile(p)
            setEditing(false)
          }}
        />
      ) : (
        <div className="card stack">
          <InfoRow label="Email" value={email} />
          <InfoRow
            label="Cómo arrancás"
            value={FOCUS_LABEL[profile.focusMode] ?? profile.focusMode}
          />
          {niche && <InfoRow label="Tu foco" value={`${niche.emoji} ${niche.label}`} />}
        </div>
      )}

      {!editing && (
        <button
          className="btn btn--danger btn--block"
          style={{ marginTop: 'var(--s5)' }}
          onClick={handleSignOut}
          disabled={signingOut}
        >
          {signingOut ? 'Cerrando…' : 'Cerrar sesión'}
        </button>
      )}

      <p className="faint tiny center" style={{ marginTop: 'var(--s8)' }}>
        Hito · v0.1 — gratis. Si algún día te sirve de verdad, vas a poder apoyar el proyecto.
      </p>
    </div>
  )
}

/** Edición de las preferencias que cambian el comportamiento de la app. */
function ProfileEditor({
  userId,
  initialFocus,
  initialNiche,
  onCancel,
  onSaved,
}: {
  userId: string
  initialFocus: FocusMode
  initialNiche: NicheId
  onCancel: () => void
  onSaved: (profile: Profile) => void
}) {
  const [focusMode, setFocusMode] = useState<FocusMode>(initialFocus)
  const [niche, setNiche] = useState<NicheId>(initialNiche)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function save() {
    setSaving(true)
    setError(null)
    try {
      const updated = await updateProfilePrefs(userId, { focusMode, primaryNiche: niche })
      onSaved(updated)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar.')
      setSaving(false)
    }
  }

  return (
    <div className="stack stack--lg">
      <div className="field">
        <span className="field__label">¿Cómo querés trabajar?</span>
        <div className="seg" style={{ alignSelf: 'flex-start' }}>
          <button
            type="button"
            className={`seg__btn${focusMode === 'single' ? ' seg__btn--active' : ''}`}
            onClick={() => setFocusMode('single')}
          >
            Una meta
          </button>
          <button
            type="button"
            className={`seg__btn${focusMode === 'multi' ? ' seg__btn--active' : ''}`}
            onClick={() => setFocusMode('multi')}
          >
            Varias metas
          </button>
        </div>
        <span className="field__hint">
          {focusMode === 'single'
            ? 'Modo enfocado: tu plan del día prioriza una sola meta por vez.'
            : 'Multi-meta: tu plan reparte acciones entre todas tus metas activas.'}
        </span>
      </div>

      <div className="field">
        <span className="field__label">Tu foco principal</span>
        <div className="row wrap">
          {NICHES.filter((n) => n.id !== 'otra').map((n) => (
            <button
              key={n.id}
              type="button"
              className={`chip${niche === n.id ? ' chip--selected' : ''}`}
              onClick={() => setNiche(n.id)}
            >
              {n.emoji} {n.label}
            </button>
          ))}
        </div>
      </div>

      {error && <div className="alert alert--error">{error}</div>}

      <div className="stack stack--sm">
        <button className="btn btn--primary btn--block" onClick={save} disabled={saving}>
          {saving ? 'Guardando…' : 'Guardar cambios'}
        </button>
        <button className="btn btn--ghost btn--block" onClick={onCancel} disabled={saving}>
          Cancelar
        </button>
      </div>
    </div>
  )
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="row row--between" style={{ gap: 'var(--s4)' }}>
      <span className="faint small">{label}</span>
      <span className="nowrap-ellipsis" style={{ textAlign: 'right' }}>
        {value}
      </span>
    </div>
  )
}
