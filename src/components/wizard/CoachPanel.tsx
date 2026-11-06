import { useEffect, useRef, useState } from 'react'
import type { ClarifyingQuestion, GoalPlan, GoalPlanInput, QuestionAnswer } from '@/domain/goalPlan'
import { refineGoalPlan, requestGoalPlan, requestQuestions } from '@/services/goalPlan'
import type { CoachChat } from '@/hooks/useCoachChat'
import { CoachComposer, CoachOrb, CoachThread } from '@/components/coach/CoachChatView'
import { countLabel } from '@/lib/plural'

interface CoachPanelProps {
  input: GoalPlanInput
  /** Etapas que la persona ya escribió: el coach las analiza y completa, no las repite. */
  stageTitles: readonly string[]
  plan: GoalPlan | null
  onPlan: (plan: GoalPlan) => void
  /** Respuestas ya dadas (null = todavía no preguntó). */
  answers: QuestionAnswer[] | null
  onAnswers: (answers: QuestionAnswer[]) => void
  /** Sugerencias aún no agregadas (para "Agregar todas"). */
  pendingCount: number
  onAddAll: () => void
  chat: CoachChat
  /** En escritorio el hilo vive aquí; en móvil va en una hoja aparte. */
  inlineThread: boolean
  onOpenChat: () => void
}

/**
 * Coach de la meta. Al entrar al paso pregunta solo (una pregunta a la vez),
 * revisa el camino y deja las sugerencias DENTRO del camino. La caja de chat
 * está siempre visible: es la vía más fácil de explicarse.
 */
type Phase =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'asking'; questions: ClarifyingQuestion[]; index: number; given: QuestionAnswer[] }
  | { kind: 'thinking'; label: string }
  | { kind: 'planned' }

const QUICK_REFINES = ['Más suave', 'Más ambicioso', 'Solo fines de semana', 'Menos etapas']
const DONT_KNOW = 'No sé todavía'

const key = (titles: readonly string[]) => titles.map((t) => t.trim().toLowerCase()).join('\n')

/** Paso del "pensando…": hecho, en curso o por venir. */
function stepClass(index: number, current: number): string {
  if (index < current) return 'done'
  return index === current ? 'on' : ''
}

function startLabel(hasPlan: boolean, hasStages: boolean): string {
  if (hasPlan) return 'Revisar de nuevo con tus cambios'
  return hasStages ? 'Revisar mi camino' : 'Armar mi camino'
}

function thinkingSteps(input: GoalPlanInput, stageCount: number): string[] {
  return [
    stageCount > 0 ? `Leyendo tus ${countLabel(stageCount, 'etapa', 'etapas')}` : 'Leyendo tu meta',
    input.weeklyMinutes ? `Comparando con tus ${input.weeklyMinutes} min por semana` : 'Pensando en un ritmo realista',
    'Buscando qué falta y dónde va',
  ]
}

/** Qué dice el coach en su cabecera según la fase. */
function statusLabel(phase: Phase): string {
  switch (phase.kind) {
    case 'asking':
      return 'Antes de revisar tu camino'
    case 'loading':
      return 'Pensando qué preguntarte…'
    case 'thinking':
      return phase.label
    case 'planned':
      return 'Revisé tu camino'
    default:
      return 'Listo cuando quieras'
  }
}

export function CoachPanel({
  input,
  stageTitles,
  plan,
  onPlan,
  answers,
  onAnswers,
  pendingCount,
  onAddAll,
  chat,
  inlineThread,
  onOpenChat,
}: Readonly<CoachPanelProps>) {
  const [phase, setPhase] = useState<Phase>(plan ? { kind: 'planned' } : { kind: 'idle' })
  const [signals, setSignals] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [step, setStep] = useState(0)
  // Camino sobre el que se hizo el último análisis: si cambió, se ofrece revisar.
  const [analyzedKey, setAnalyzedKey] = useState<string | null>(plan ? key(stageTitles) : null)
  const started = useRef(false)

  const hasStages = stageTitles.length > 0
  const changedSinceAnalysis = plan !== null && analyzedKey !== key(stageTitles)
  const withStages = (extra: Partial<GoalPlanInput> = {}): GoalPlanInput => ({
    ...input,
    answers: answers ?? [],
    currentStages: [...stageTitles],
    ...extra,
  })

  // Pasos de "pensando": avanzan solos mientras espera la respuesta.
  const thinking = phase.kind === 'thinking' || phase.kind === 'loading'
  useEffect(() => {
    if (phase.kind !== 'thinking') return
    setStep(0)
    const t = window.setInterval(() => setStep((s) => Math.min(s + 1, 2)), 700)
    return () => window.clearInterval(t)
  }, [phase.kind])

  function fail(err: unknown, fallback: Phase) {
    setError(err instanceof Error ? err.message : 'No pudimos generar sugerencias ahora.')
    setPhase(fallback)
  }

  async function analyze(given: QuestionAnswer[]) {
    setPhase({ kind: 'thinking', label: hasStages ? 'Revisando tu camino…' : 'Armando tu camino…' })
    setError(null)
    try {
      const result = await requestGoalPlan(withStages({ answers: given }))
      onAnswers(given)
      onPlan(result.plan)
      setSignals(result.signals)
      setAnalyzedKey(key(stageTitles))
      setPhase({ kind: 'planned' })
    } catch (err) {
      onAnswers(given)
      fail(err, plan ? { kind: 'planned' } : { kind: 'idle' })
    }
  }

  async function start() {
    // Si ya respondió, revisar de nuevo va directo al análisis.
    if (answers) return analyze(answers)
    setPhase({ kind: 'loading' })
    setError(null)
    try {
      const questions = await requestQuestions(withStages())
      if (questions.length === 0) return analyze([])
      setPhase({ kind: 'asking', questions, index: 0, given: [] })
    } catch (err) {
      fail(err, { kind: 'idle' })
    }
  }

  // Al entrar al paso las preguntas aparecen solas, sin botón previo.
  useEffect(() => {
    if (started.current || plan || answers) return
    started.current = true
    void start()
    // Solo al montar: start lee el estado del momento.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function answer(text: string) {
    if (phase.kind !== 'asking') return
    const q = phase.questions[phase.index]
    const given = [...phase.given, { question: q.question, answer: text }]
    if (phase.index + 1 < phase.questions.length) setPhase({ ...phase, index: phase.index + 1, given })
    else void analyze(given.filter((a) => a.answer !== DONT_KNOW))
  }

  async function refine(request: string) {
    if (!plan || !request.trim()) return
    setPhase({ kind: 'thinking', label: 'Ajustando las sugerencias…' })
    setError(null)
    try {
      const result = await refineGoalPlan(withStages(), plan, request)
      onPlan(result.plan)
      setSignals(result.signals)
      setAnalyzedKey(key(stageTitles))
      setPhase({ kind: 'planned' })
    } catch (err) {
      fail(err, { kind: 'planned' })
    }
  }

  const status = statusLabel(phase)

  function sendChat(text: string) {
    void chat.send(text)
    if (!inlineThread) onOpenChat()
  }

  return (
    <section className={`coach${thinking || chat.pending ? ' coach--thinking' : ''}`} aria-label="Coach de tu meta">
      <div className="coach__head">
        <CoachOrb thinking={thinking || chat.pending} />
        <div className="stack" style={{ gap: 2 }}>
          <strong>Coach de tu meta</strong>
          <span key={status} className="small faint coach__status">
            {status}
          </span>
        </div>
      </div>

      {phase.kind === 'loading' && (
        <div className="stack stack--sm" aria-hidden="true">
          <span className="skel" style={{ width: '85%' }} />
          <span className="skel" style={{ width: '60%' }} />
        </div>
      )}

      {phase.kind === 'asking' && (
        <div className="stack stack--sm">
          {phase.given.map((a) => (
            <div key={a.question} className="coach-qa">
              <span>{a.question}</span>
              <b>{a.answer}</b>
            </div>
          ))}
          <fieldset key={phase.index} className="coach__q coach-rise">
            <span className="coach-count small faint">
              {phase.index + 1} de {phase.questions.length}
              <span className="coach-dots" aria-hidden="true">
                {phase.questions.map((q, i) => (
                  <i key={q.question} className={i <= phase.index ? 'on' : ''} />
                ))}
              </span>
            </span>
            <legend className="coach__question">{phase.questions[phase.index].question}</legend>
            <div className="row wrap" style={{ gap: 'var(--s2)' }}>
              {phase.questions[phase.index].options.map((o) => (
                <button key={o} type="button" className="chip" onClick={() => answer(o)}>
                  {o}
                </button>
              ))}
              <button type="button" className="chip chip--quiet" onClick={() => answer(DONT_KNOW)}>
                {DONT_KNOW}
              </button>
            </div>
          </fieldset>
          <button
            type="button"
            className="btn--link muted"
            style={{ justifySelf: 'start' }}
            onClick={() => void analyze(phase.given.filter((a) => a.answer !== DONT_KNOW))}
          >
            Saltar preguntas
          </button>
        </div>
      )}

      {phase.kind === 'thinking' && (
        <ul className="coach-steps" aria-live="polite">
          {thinkingSteps(input, stageTitles.length).map((t, i) => (
            <li key={t} className={stepClass(i, step)}>
              {t}
            </li>
          ))}
        </ul>
      )}

      {(phase.kind === 'idle' || (phase.kind === 'planned' && changedSinceAnalysis)) && (
        <button type="button" className="btn btn--primary btn--sm coach__cta" onClick={() => void start()}>
          {startLabel(plan !== null, hasStages)}
        </button>
      )}

      {error && (
        <p className="tiny faint" role="status">
          {error}
        </p>
      )}

      {phase.kind === 'planned' && plan && (
        <div className="stack stack--sm coach-rise">
          {plan.changeNote && <p className="small coach__change">{plan.changeNote}</p>}
          {plan.summary && <p className="small">{plan.summary}</p>}
          {plan.notes && plan.notes.length > 0 && (
            <ul className="coach__notes">
              {plan.notes.map((n) => (
                <li key={n} className="small">
                  {n}
                </li>
              ))}
            </ul>
          )}
          <div className="row wrap" style={{ justifyContent: 'space-between', alignItems: 'center', gap: 'var(--s2)' }}>
            <span className="small faint">
              {pendingCount > 0
                ? `${countLabel(pendingCount, 'sugerencia marcada', 'sugerencias marcadas')} con + en tu camino.`
                : 'No hay sugerencias pendientes: tu camino se ve completo.'}
            </span>
            {pendingCount > 1 && (
              <button type="button" className="btn--link" onClick={onAddAll}>
                Agregar todas
              </button>
            )}
          </div>
          {signals.length > 0 && <p className="tiny faint">Tuvimos en cuenta: {signals.join(' ')}</p>}
          <div className="row wrap" style={{ gap: 'var(--s2)' }}>
            {QUICK_REFINES.map((r) => (
              <button key={r} type="button" className="chip" onClick={() => void refine(r)}>
                {r}
              </button>
            ))}
          </div>
        </div>
      )}

      {inlineThread && <CoachThread chat={chat} />}
      <CoachComposer
        onSend={sendChat}
        disabled={chat.pending}
        placeholder={phase.kind === 'asking' ? 'O cuéntale con tus palabras…' : 'Cuéntale con tus palabras…'}
      />
      {inlineThread && chat.messages.length === 0 && (
        <span className="tiny faint">Ej.: “ya tengo la licencia” o “solo puedo los sábados”.</span>
      )}
    </section>
  )
}
