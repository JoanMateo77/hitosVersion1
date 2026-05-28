import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { completeOnboarding } from '@/services/profile'
import { NICHES, NICHE_QUESTIONS, getNiche, scoreNiche } from '@/domain/niches'
import type { FocusMode, NicheId } from '@/lib/types'
import { IconBack } from '@/components/icons'
import { OptionRow } from '@/components/OptionRow'

type Step = 'focus' | 'niche'

export function Onboarding() {
  const { userId, setProfile } = useSession()
  const navigate = useNavigate()

  const [step, setStep] = useState<Step>('focus')
  const [focusMode, setFocusMode] = useState<FocusMode | null>(null)
  const [niche, setNiche] = useState<NicheId | null>(null)

  // Sub-flujo "no sé mi foco": mini-entrevista determinística.
  const [interview, setInterview] = useState(false)
  const [answers, setAnswers] = useState<NicheId[]>([])
  const [suggested, setSuggested] = useState<NicheId | null>(null)

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function chooseFocus(mode: FocusMode) {
    setFocusMode(mode)
    setStep('niche')
  }

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

  async function finish() {
    if (!focusMode || !niche) return
    setSaving(true)
    setError(null)
    try {
      const updated = await completeOnboarding(userId, { focusMode, primaryNiche: niche })
      setProfile(updated)
      // En vez de un formulario vacío, lo primero que ve es ideas concretas (5.1).
      navigate('/ideas', { replace: true })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No se pudo guardar. Probá de nuevo.')
      setSaving(false)
    }
  }

  return (
    <div className="screen screen--full flow-screen">
      <Stepper step={step} />

      {step === 'focus' && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s6)' }}>
          <header>
            <h1 className="screen__title">Bienvenido/a 👋</h1>
            <p className="screen__subtitle">
              Dos preguntas rápidas para adaptar Hito a vos.
            </p>
          </header>
          <h2 style={{ fontSize: 'var(--fs-lg)' }}>¿Cómo querés arrancar?</h2>
          <div className="stack">
            <OptionRow
              emoji="🎯"
              label="Con una sola meta"
              desc="Modo enfocado: un objetivo principal, sin dispersarte."
              selected={false}
              onClick={() => chooseFocus('single')}
            />
            <OptionRow
              emoji="🧭"
              label="Con varias metas"
              desc="Modo multi-meta: la app reparte tu energía entre ellas."
              selected={false}
              onClick={() => chooseFocus('multi')}
            />
          </div>
        </section>
      )}

      {step === 'niche' && !interview && (
        <section className="stack stack--lg" style={{ marginTop: 'var(--s5)' }}>
          <button className="iconbtn" onClick={() => setStep('focus')} aria-label="Volver">
            <IconBack />
          </button>
          <header>
            <h1 className="screen__title">¿Cuál es tu foco?</h1>
            <p className="screen__subtitle">
              El área de tu vida en la que querés avanzar ahora. Después podés sumar otras.
            </p>
          </header>

          {suggested && (
            <div className="alert" style={{ background: 'var(--primary-soft)', color: 'var(--text)' }}>
              Según tus respuestas, tu foco sería{' '}
              <strong>
                {getNiche(suggested).emoji} {getNiche(suggested).label}
              </strong>
              . Podés cambiarlo abajo.
            </div>
          )}

          <div className="stack stack--sm">
            {NICHES.filter((n) => n.id !== 'otra').map((n) => (
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
            🤔 No estoy seguro/a — ayudame a descubrirlo
          </button>

          {error && <div className="alert alert--error">{error}</div>}

          <button className="btn btn--primary btn--block" disabled={!niche || saving} onClick={finish}>
            {saving ? 'Guardando…' : 'Continuar'}
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
    </div>
  )
}

function Stepper({ step }: { step: Step }) {
  return (
    <div className="stepper" style={{ marginTop: 'var(--s2)' }}>
      <span className={`stepper__dot ${step === 'focus' ? 'stepper__dot--active' : 'stepper__dot--done'}`} />
      <span className={`stepper__dot ${step === 'niche' ? 'stepper__dot--active' : ''}`} />
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
