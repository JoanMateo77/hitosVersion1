import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { completeOnboarding } from '@/services/profile'
import { NICHES, NICHE_QUESTIONS, getNiche, scoreNiche } from '@/domain/niches'
import type { NicheId, PreferredMoment } from '@/lib/types'
import { IconBack, IconHito } from '@/components/icons'
import { OptionRow } from '@/components/OptionRow'

type Step = 'promise' | 'niche' | 'time' | 'moment'
const STEPS: Step[] = ['promise', 'niche', 'time', 'moment']

const TIME_PRESETS = [15, 30, 60]

/**
 * Onboarding: termina con el usuario dentro del wizard, con sus defaults de
 * dedicación y horario ya capturados. Cada respuesta SE USA. Salida discreta
 * para quien prefiere mirar primero — compromete sin secuestrar.
 */
export function Onboarding() {
  const { userId, setProfile } = useSession()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('promise')
  const [niche, setNiche] = useState<NicheId | null>(null)
  const [minutes, setMinutes] = useState<number>(30)
  const [customTime, setCustomTime] = useState(false)
  const [moment, setMoment] = useState<PreferredMoment | null>(null)

  // Sub-flujo "no sé mi foco": mini-entrevista determinística.
  const [interview, setInterview] = useState(false)
  const [answers, setAnswers] = useState<NicheId[]>([])
  const [suggested, setSuggested] = useState<NicheId | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function answerQuestion(picked: NicheId) {
    const next = [...answers, picked]
    if (next.length >= NICHE_QUESTIONS.length) {
      const result = scoreNiche(next)
      setNiche(result)
      setSuggested(result)
      setInterview(false)
      setAnswers([])
    } else {
      setAnswers(next)
    }
  }

  async function finish(destination: '/meta/nueva' | '/') {
    setSaving(true)
    setError(null)
    try {
      const updated = await completeOnboarding(userId, {
        primaryNiche: niche,
        preferredMoment: moment,
        defaultSessionMinutes: minutes,
      })
      setProfile(updated)
      navigate(destination, { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Inténtalo de nuevo.')
      setSaving(false)
    }
  }

  const stepIndex = STEPS.indexOf(step)

  return (
    <div className="screen screen--full flow-screen">
      <div className="stepper" aria-hidden="true" style={{ marginTop: 'var(--s2)' }}>
        {STEPS.map((s, i) => (
          <span
            key={s}
            className={`stepper__dot ${i < stepIndex ? 'stepper__dot--done' : i === stepIndex ? 'stepper__dot--active' : ''}`}
          />
        ))}
      </div>

      {/* ----- 1 · La promesa ----- */}
      {step === 'promise' && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s8)', flex: 1 }}>
          <header className="center stack stack--sm" style={{ alignItems: 'center' }}>
            <span
              aria-hidden="true"
              style={{
                width: 64,
                height: 64,
                borderRadius: 18,
                background: 'var(--gradient-brand)',
                color: 'var(--on-primary)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <IconHito size={34} />
            </span>
            <h1 className="screen__title">Lógralo</h1>
            <p className="screen__subtitle center">Tu meta, con un compromiso real.</p>
          </header>
          <div className="stack stack--sm">
            {[
              ['🗺️', 'Un camino por etapas', 'Tu meta se divide en pasos editables que se marcan de verdad.'],
              ['⏱️', 'Sesiones comprometidas', 'Eliges días y tiempos; el cronómetro te acompaña en cada una.'],
              ['📈', 'Progreso que no se inventa', 'Todo se calcula de lo que realmente haces. Sin humo.'],
            ].map(([emoji, label, desc]) => (
              <div key={label} className="card card--tight row" style={{ alignItems: 'flex-start', gap: 'var(--s3)' }}>
                <span aria-hidden="true" style={{ fontSize: 22, flex: 'none' }}>
                  {emoji}
                </span>
                <span>
                  <strong>{label}</strong>
                  <span className="small muted" style={{ display: 'block' }}>
                    {desc}
                  </span>
                </span>
              </div>
            ))}
          </div>
          <button className="btn btn--primary btn--block" onClick={() => setStep('niche')}>
            Empezar
          </button>
          <button
            className="btn--link"
            style={{ alignSelf: 'center', fontSize: 'var(--fs-xs)' }}
            disabled={saving}
            onClick={() => void finish('/')}
          >
            Prefiero mirar la app primero
          </button>
        </section>
      )}

      {/* ----- 2 · Qué cambiar primero ----- */}
      {step === 'niche' && !interview && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s5)' }}>
          <button className="iconbtn" onClick={() => setStep('promise')} aria-label="Volver">
            <IconBack />
          </button>
          <header>
            <h1 className="screen__title">¿Qué quieres cambiar primero?</h1>
            <p className="screen__subtitle">El área donde quieres avanzar ahora. Después puedes sumar otras.</p>
          </header>

          {suggested && (
            <div className="alert" style={{ background: 'var(--primary-soft)', color: 'var(--text)' }}>
              Según tus respuestas, tu foco sería{' '}
              <strong>
                {getNiche(suggested).emoji} {getNiche(suggested).label}
              </strong>
              . Puedes cambiarlo abajo.
            </div>
          )}

          <div className="stack stack--sm">
            {NICHES.map((n) => (
              <OptionRow
                key={n.id}
                emoji={n.emoji}
                label={n.label}
                desc={n.blurb}
                selected={niche === n.id}
                onClick={() => setNiche(n.id)}
              />
            ))}
          </div>

          <button
            className="btn btn--ghost"
            onClick={() => {
              setInterview(true)
              setAnswers([])
              setSuggested(null)
            }}
          >
            🤔 No estoy seguro — ayúdame a descubrirlo
          </button>

          <button className="btn btn--primary btn--block" disabled={!niche} onClick={() => setStep('time')}>
            Continuar
          </button>
        </section>
      )}

      {step === 'niche' && interview && (
        <Interview
          index={answers.length}
          onPick={answerQuestion}
          onCancel={() => {
            setInterview(false)
            setAnswers([])
          }}
        />
      )}

      {/* ----- 3 · Dedicación (sin techo) ----- */}
      {step === 'time' && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s5)' }}>
          <button className="iconbtn" onClick={() => setStep('niche')} aria-label="Volver">
            <IconBack />
          </button>
          <header>
            <h1 className="screen__title">¿Cuánto tiempo puedes dedicarle a tu meta?</h1>
            <p className="screen__subtitle">
              Es un punto de partida: después defines cuánto por cada día, y lo ajustas cuando quieras.
            </p>
          </header>
          <div className="stack stack--sm">
            {TIME_PRESETS.map((m) => (
              <OptionRow
                key={m}
                emoji={m === 15 ? '🌱' : m === 30 ? '🌿' : '🌳'}
                label={`${m} minutos al día`}
                selected={!customTime && minutes === m}
                onClick={() => {
                  setCustomTime(false)
                  setMinutes(m)
                }}
              />
            ))}
            <OptionRow
              emoji="✏️"
              label="Otro — tú decides cuánto"
              selected={customTime}
              onClick={() => setCustomTime(true)}
            />
            {customTime && (
              <div className="row" style={{ alignItems: 'center', justifyContent: 'center' }}>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Restar 5 minutos"
                  disabled={minutes <= 5}
                  onClick={() => setMinutes((m) => Math.max(5, m - 5))}
                >
                  −
                </button>
                <strong style={{ minWidth: 110, textAlign: 'center', fontSize: 'var(--fs-lg)' }}>
                  {minutes >= 60 ? `${Math.floor(minutes / 60)} h ${minutes % 60 || ''}${minutes % 60 ? ' min' : ''}` : `${minutes} min`}
                </strong>
                <button type="button" className="iconbtn" aria-label="Sumar 5 minutos" onClick={() => setMinutes((m) => m + 5)}>
                  +
                </button>
              </div>
            )}
          </div>
          <button className="btn btn--primary btn--block" onClick={() => setStep('moment')}>
            Continuar
          </button>
        </section>
      )}

      {/* ----- 4 · Tu momento ----- */}
      {step === 'moment' && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s5)' }}>
          <button className="iconbtn" onClick={() => setStep('time')} aria-label="Volver">
            <IconBack />
          </button>
          <header>
            <h1 className="screen__title">¿Cuándo te es más fácil cumplir?</h1>
            <p className="screen__subtitle">Sugiere la hora de tus sesiones. Siempre puedes cambiarla.</p>
          </header>
          <div className="stack stack--sm">
            <OptionRow emoji="🌅" label="Por la mañana" selected={moment === 'morning'} onClick={() => setMoment('morning')} />
            <OptionRow emoji="☀️" label="Al mediodía" selected={moment === 'midday'} onClick={() => setMoment('midday')} />
            <OptionRow emoji="🌙" label="Por la noche" selected={moment === 'evening'} onClick={() => setMoment('evening')} />
            <OptionRow emoji="🤷" label="Depende del día" selected={moment === null} onClick={() => setMoment(null)} />
          </div>

          {error && <div className="alert alert--error" role="alert">{error}</div>}

          <button className="btn btn--primary btn--block" disabled={saving} onClick={() => void finish('/meta/nueva')}>
            {saving ? 'Guardando…' : 'Crear mi primera meta'}
          </button>
        </section>
      )}
    </div>
  )
}

function Interview({
  index,
  onPick,
  onCancel,
}: {
  index: number
  onPick: (niche: NicheId) => void
  onCancel: () => void
}) {
  const question = NICHE_QUESTIONS[index]
  return (
    <section className="stack stack--lg" style={{ marginTop: 'var(--s5)' }}>
      <button className="iconbtn" onClick={onCancel} aria-label="Volver">
        <IconBack />
      </button>
      <header>
        <p className="faint small">
          Pregunta {index + 1} de {NICHE_QUESTIONS.length}
        </p>
        <h1 className="screen__title" style={{ marginTop: 4 }}>
          {question.prompt}
        </h1>
      </header>
      <div className="stack stack--sm">
        {question.options.map((opt) => (
          <OptionRow key={opt.label} label={opt.label} onClick={() => onPick(opt.niche)} />
        ))}
      </div>
    </section>
  )
}
