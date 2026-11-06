import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { createGoal, deleteGoal } from '@/services/goals'
import { detectTemplate, getTemplate } from '@/domain/templates'
import { NICHES, getNiche } from '@/domain/niches'
import type { NicheId, ScheduleBlock } from '@/lib/types'
import { formatLongDate, relativeDeadline, todayISO } from '@/lib/date'
import { IconCalendar, IconChevronLeft, IconLightbulb } from '@/components/icons'
import { NicheGlyph } from '@/components/NicheGlyph'
import { nicheAccent } from '@/lib/nicheAccent'
import { Hint } from '@/components/Hint'
import {
  formatCommitmentSummary,
  weeklyTotal,
  preferredStartTime,
  validateCommitment,
  type CommitmentBlockDraft,
  type MilestoneDraft,
} from '@/domain/commitment'
import { listActiveGoalSchedule, createScheduleBlocks } from '@/services/schedule'
import { generateSessionsForDate } from '@/services/sessions'
import { createMilestones } from '@/services/milestones'
import { WIZARD_DRAFT_KEY } from '@/lib/wizardDraft'
import { clearWizardIntent } from '@/app/onboardingIntent'
import { CommitmentStep } from '@/components/wizard/CommitmentStep'
import { MilestonesStep } from '@/components/wizard/MilestonesStep'
import { CoachPanel } from '@/components/wizard/CoachPanel'
import { parseGoalPlan, resolveInsertIndex, type GoalPlan, type GoalPlanStage, type QuestionAnswer } from '@/domain/goalPlan'
import { applyStageChanges, readStoredProposal, type ChatContext, type StageChange } from '@/domain/coachChat'
import { useCoachChat } from '@/hooks/useCoachChat'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { addCoachMessages, saveGoalAi, type CoachMessage } from '@/services/goalCoach'
import { Sheet } from '@/components/Sheet'
import { CoachComposer, CoachOrb, CoachThread } from '@/components/coach/CoachChatView'
import { CriteriaSuggest } from '@/components/wizard/CriteriaSuggest'
import type { CriterionOption } from '@/domain/coachChat'
import { requestGoalType } from '@/services/goalPlan'
import { NBSP } from '@/lib/format'
import { TypeStep } from '@/components/wizard/TypeStep'
import {
  aiSuggestion,
  answersWithTypeNote,
  keywordSuggestion,
  parseTypeDraft,
  typeLabelFor,
  type TypeSuggestionDraft,
} from '@/components/wizard/typeDraft'
import { focusOnMount } from '@/lib/focus'

/** Pasos del wizard: título · tipo · compromiso · camino · ancla · resumen. */
const STEPS = 6

const DRAFT_KEY = WIZARD_DRAFT_KEY

interface WizardDraft {
  step: number
  title: string
  templateKey: string
  why: string
  targetDate: string
  area: NicheId
  criteria: string
  blocks: CommitmentBlockDraft[]
  milestones: MilestoneDraft[]
  /** Plan sugerido por la IA en el paso de etapas (se conserva al ir y volver). */
  aiPlan: GoalPlan | null
  /** Respuestas a las preguntas del coach (null = aún no preguntó). */
  aiAnswers: QuestionAnswer[] | null
  /** Conversación con el coach durante el asistente; se guarda con la meta. */
  chat: CoachMessage[]
  /** "¿Ninguno encaja?": la meta descrita con sus palabras (tipo personalizada). */
  typeNote: string
  /** La persona eligió el tipo a mano: la IA ya no lo cambia. */
  typePicked: boolean
  /** Tipo sugerido (palabras clave o IA), para no volver a preguntar al recargar. */
  typeSuggestion: TypeSuggestionDraft | null
}

/** Type-guard: ¿el valor es un NicheId válido? Espejo de isTheme en theme.ts. */
function isNiche(value: unknown): value is NicheId {
  return typeof value === 'string' && NICHES.some((n) => n.id === value)
}

/**
 * Lee el borrador de sessionStorage validando campo por campo: no confiamos a
 * ciegas en el JSON (puede estar corrupto o de una versión vieja). El step se
 * acota al rango válido para que un draft roto no rompa el render.
 */
function loadDraft(): Partial<WizardDraft> {
  try {
    const raw = sessionStorage.getItem(DRAFT_KEY)
    if (!raw) return {}
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object') return {}
    const d = parsed as Record<string, unknown>
    const draft: Partial<WizardDraft> = {}
    if (typeof d.step === 'number' && Number.isFinite(d.step)) {
      draft.step = Math.min(Math.max(Math.trunc(d.step), 0), STEPS - 1)
    }
    if (typeof d.title === 'string') draft.title = d.title
    if (typeof d.why === 'string') draft.why = d.why
    if (typeof d.targetDate === 'string') draft.targetDate = d.targetDate
    if (isNiche(d.area)) draft.area = d.area
    if (typeof d.criteria === 'string') draft.criteria = d.criteria
    // Tipo, descripción libre y sugerencia: validados contra el catálogo.
    Object.assign(draft, parseTypeDraft(d))
    if (d.aiPlan != null) draft.aiPlan = parseGoalPlan(d.aiPlan, 0)
    if (Array.isArray(d.aiAnswers)) {
      draft.aiAnswers = (d.aiAnswers as unknown[]).filter(
        (a): a is QuestionAnswer =>
          a != null &&
          typeof a === 'object' &&
          typeof (a as Record<string, unknown>).question === 'string' &&
          typeof (a as Record<string, unknown>).answer === 'string',
      )
    }
    if (Array.isArray(d.chat)) {
      draft.chat = (d.chat as unknown[]).filter(
        (m): m is CoachMessage =>
          m != null &&
          typeof m === 'object' &&
          typeof (m as Record<string, unknown>).id === 'string' &&
          typeof (m as Record<string, unknown>).text === 'string' &&
          ((m as Record<string, unknown>).role === 'user' || (m as Record<string, unknown>).role === 'coach'),
      ).map((m) => ({ ...m, proposal: readStoredProposal(m.proposal) }))
    }
    if (Array.isArray(d.blocks)) {
      draft.blocks = (d.blocks as unknown[]).filter(
        (item): item is CommitmentBlockDraft =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).weekday === 'number',
      )
    }
    if (Array.isArray(d.milestones)) {
      draft.milestones = (d.milestones as unknown[]).filter(
        (item): item is MilestoneDraft =>
          item != null &&
          typeof item === 'object' &&
          typeof (item as Record<string, unknown>).title === 'string',
      )
    }
    return draft
  } catch {
    return {}
  }
}

function clearDraft() {
  try {
    sessionStorage.removeItem(DRAFT_KEY)
  } catch {
    /* ignore */
  }
}

export function Wizard() {
  const { userId, profile } = useSession()
  const navigate = useNavigate()

  const [draft] = useState(loadDraft)
  const [step, setStep] = useState(draft.step ?? 0)
  const [title, setTitle] = useState(draft.title ?? '')
  const [templateKey, setTemplateKey] = useState(draft.templateKey ?? '')
  const [why, setWhy] = useState(draft.why ?? '')
  const [targetDate, setTargetDate] = useState(draft.targetDate ?? '')
  const [area, setArea] = useState<NicheId>(draft.area ?? profile.primaryNiche ?? 'otra')
  const [criteria, setCriteria] = useState(draft.criteria ?? '')
  // Título con el que ya autodetectamos plantilla/área. Evita pisar una elección
  // manual del paso 1 al volver al paso 0 y avanzar sin cambiar el título.
  const [detectedFromTitle, setDetectedFromTitle] = useState(draft.title ?? '')
  // Paso del tipo: sugerencia (palabras clave → IA), elección manual y "Otra: …".
  const [typeNote, setTypeNote] = useState(draft.typeNote ?? '')
  const [typePicked, setTypePicked] = useState(draft.typePicked ?? false)
  const [typeSuggestion, setTypeSuggestion] = useState<TypeSuggestionDraft | null>(draft.typeSuggestion ?? null)
  // Título que la IA está leyendo (null = nada en curso).
  const [typeReading, setTypeReading] = useState<string | null>(null)
  // Lo lee la respuesta asíncrona de la IA: si ya eligió a mano, no se pisa.
  const typePickedRef = useRef(typePicked)
  const typeRequest = useRef(0)

  const [blocks, setBlocks] = useState<CommitmentBlockDraft[]>(draft.blocks ?? [])
  // Las etapas arrancan vacías: la plantilla y la IA solo SUGIEREN (se agregan con un clic).
  const [milestones, setMilestones] = useState<MilestoneDraft[]>(draft.milestones ?? [])
  const [aiPlan, setAiPlan] = useState<GoalPlan | null>(draft.aiPlan ?? null)
  const [aiAnswers, setAiAnswers] = useState<QuestionAnswer[] | null>(draft.aiAnswers ?? null)
  const [criteriaOptions, setCriteriaOptions] = useState<CriterionOption[] | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [existingBlocks, setExistingBlocks] = useState<ScheduleBlock[]>([])

  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Con "Otra: …" el coach sabe de qué va la meta aunque no encaje en un tipo.
  const typeLabel = typeLabelFor(templateKey, typeNote)
  const weeklyMinutes = weeklyTotal(blocks).minutes || null
  const chatContext = useCallback(
    (): ChatContext => ({
      title,
      typeLabel,
      area,
      why,
      targetDate,
      weeklyMinutes,
      answers: aiAnswers ?? [],
      successCriteria: criteria,
      stages: milestones.map((m) => ({ title: m.title })),
      // Todavía no hay meta donde guardar un avance: el coach no lo propone.
      canLogProgress: false,
    }),
    [title, typeLabel, area, why, targetDate, weeklyMinutes, aiAnswers, criteria, milestones],
  )
  // Los cambios que la persona acepta en el chat se aplican al borrador del camino.
  const applyChanges = useCallback((changes: StageChange[]) => {
    setMilestones((current) => {
      const byTitle = new Map(current.map((m) => [m.title.trim().toLowerCase(), m]))
      const titles = applyStageChanges(
        current.map((m) => m.title),
        changes,
      )
      return renumberDrafts(
        titles.map(
          (t) => byTitle.get(t.trim().toLowerCase()) ?? { title: t, position: 0, targetDate: null, done: false },
        ),
      )
    })
  }, [])
  const chat = useCoachChat({ getContext: chatContext, onApply: applyChanges, initial: draft.chat ?? [] })

  // Consumimos la intención del onboarding: si llegamos aquí venimos de "Crear
  // mi primera meta", y ya no queremos que el redirect de /onboarding reaparezca.
  useEffect(() => {
    clearWizardIntent()
  }, [])

  // Carga los bloques de otras metas ACTIVAS del usuario (guardia de
  // sobrecompromiso): las metas logradas o archivadas ya no ocupan agenda.
  useEffect(() => {
    listActiveGoalSchedule(userId)
      .then(setExistingBlocks)
      .catch(() => setExistingBlocks([]))
  }, [userId])

  // Defaults del compromiso desde el perfil del usuario.
  const defaultMinutes = profile.defaultSessionMinutes ?? 25
  const defaultStart = preferredStartTime(profile.preferredMoment)

  // Persistimos el borrador en cada cambio, salvo el estado vacío inicial.
  useEffect(() => {
    const isEmpty =
      step === 0 &&
      !title &&
      !templateKey &&
      !why &&
      !targetDate &&
      !criteria &&
      blocks.length === 0 &&
      milestones.length === 0
    if (isEmpty) return
    try {
      sessionStorage.setItem(
        DRAFT_KEY,
        JSON.stringify({
          step,
          title,
          templateKey,
          why,
          targetDate,
          area,
          criteria,
          blocks,
          milestones,
          aiPlan,
          aiAnswers,
          chat: chat.messages,
          typeNote,
          typePicked,
          typeSuggestion,
        }),
      )
    } catch {
      /* ignore */
    }
  }, [step, title, templateKey, why, targetDate, area, criteria, blocks, milestones, aiPlan, aiAnswers, chat.messages, typeNote, typePicked, typeSuggestion])

  /**
   * Pide a la IA el tipo de meta. Mientras tanto queda la detección por
   * palabras; si falla, se queda esa en silencio. La respuesta solo cambia la
   * elección si la persona no eligió a mano entretanto.
   */
  const askType = useCallback((forTitle: string) => {
    const id = ++typeRequest.current
    setTypeReading(forTitle)
    requestGoalType(forTitle)
      .then((raw) => {
        const s = aiSuggestion(raw)
        if (id !== typeRequest.current || !s || typePickedRef.current) return
        setTypeSuggestion(s)
        setTemplateKey(s.key)
        setArea(getTemplate(s.key).defaultArea)
      })
      .catch(() => {})
      .finally(() => {
        if (id === typeRequest.current) setTypeReading(null)
      })
  }, [])

  // Al salir del asistente, la respuesta pendiente de la IA ya no aplica.
  // (requestGoalType no acepta AbortSignal: se descarta en vez de cortarse.)
  useEffect(
    () => () => {
      typeRequest.current++
    },
    [],
  )

  // Recarga en el paso del tipo sin respuesta de la IA todavía: se pide una vez.
  const askedOnLoad = useRef(false)
  useEffect(() => {
    if (askedOnLoad.current) return
    askedOnLoad.current = true
    if (step === 1 && title.trim() && typeSuggestion?.source !== 'ai' && !typePicked) askType(title)
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function pickType(key: string) {
    // Elegir a mano descarta la lectura en curso: la IA no cambia lo que la
    // persona tiene bajo el dedo y el aviso de "leyendo" desaparece.
    typeRequest.current++
    setTypeReading(null)
    typePickedRef.current = true
    setTypePicked(true)
    setTemplateKey(key)
    setArea(getTemplate(key).defaultArea)
    // Elegir un tipo de la lista reemplaza la descripción libre.
    if (key !== 'personalizada') setTypeNote('')
  }

  function changeTypeNote(note: string) {
    setTypeNote(note)
    if (note.trim()) pickType('personalizada')
  }

  function goBack() {
    if (step === 0) {
      navigate('/')
      return
    }
    setStep((s) => s - 1)
  }

  function next() {
    // Al salir del título sugerimos plantilla y área, pero solo si el título cambió
    // desde la última detección: así no pisamos la elección manual del paso 1.
    if (step === 0 && title !== detectedFromTitle) {
      const detected = detectTemplate(title)
      setTemplateKey(detected.key)
      setArea(detected.defaultArea)
      setDetectedFromTitle(title)
      setTypeSuggestion(keywordSuggestion(detected.key))
      setTypeNote('')
      typePickedRef.current = false
      setTypePicked(false)
      askType(title)
      // Si cambió la meta, el plan, las respuestas y las opciones de la IA ya no aplican.
      setAiPlan(null)
      setAiAnswers(null)
      setCriteriaOptions(null)
    }
    // Continuar con la sugerencia a la vista es elegirla: la IA ya no la cambia.
    if (step === 1) {
      typePickedRef.current = true
      setTypePicked(true)
    }
    setStep((s) => s + 1)
  }

  async function submit() {
    // Defensa del invariante: la agenda es opcional, pero un compromiso mal
    // formado o una meta sin etapas no se crean, ni desde un borrador manipulado.
    if (validateCommitment(blocks) !== null || milestones.length === 0) {
      setError('Tu meta necesita al menos una etapa y un compromiso válido.')
      return
    }
    setSaving(true)
    setError(null)
    let createdGoalId: string | null = null
    try {
      const goal = await createGoal(userId, {
        title: title.trim(),
        why: why.trim() || null,
        targetDate: targetDate || null,
        area,
        successCriteria: criteria.trim() || null,
        templateKey: templateKey || 'personalizada',
      })
      createdGoalId = goal.id
      await createMilestones(userId, goal.id, milestones.map((m, position) => ({ ...m, position })))
      const createdBlocks = await createScheduleBlocks(userId, goal.id, blocks)
      // Memoria del coach: si falla (p. ej. sin migración 0018) la meta igual se crea.
      // La descripción libre del tipo viaja como una respuesta más (no va en
      // aiAnswers: el coach solo pregunta solo cuando aiAnswers es null).
      await saveGoalAi(goal.id, { plan: aiPlan, answers: answersWithTypeNote(aiAnswers ?? [], templateKey, typeNote) })
      await addCoachMessages(
        userId,
        goal.id,
        chat.messages.map((m) => ({ role: m.role, text: m.text, proposal: m.proposal })),
      )
      // Si hoy es día comprometido, la sesión aparece en Hoy al instante.
      await generateSessionsForDate(userId, todayISO(), createdBlocks).catch(() => {})
      // Le mostramos el camino + la primera acción: la app guía, no solo crea.
      clearDraft()
      navigate(`/meta/creada/${goal.id}`, { replace: true })
    } catch (err) {
      console.error('No se pudo crear la meta con su contrato:', err)
      // Si la meta quedó a medias (sin hitos o sin compromiso), la deshacemos:
      // una meta sin contrato es exactamente lo que este rediseño elimina.
      if (createdGoalId) await deleteGoal(userId, createdGoalId).catch(() => {})
      setError('No pudimos crear tu meta. Inténtalo de nuevo en un momento.')
      setSaving(false)
    }
  }

  // Sugerencias del coach que la persona aún no agregó (por título).
  const milestoneTitles = milestones.map((m) => m.title)
  const pendingSuggestions: GoalPlanStage[] = (aiPlan?.stages ?? []).filter(
    (s) => !milestoneTitles.some((t) => t.trim().toLowerCase() === s.title.trim().toLowerCase()),
  )

  /** Inserta una sugerencia en la posición donde encaja según su ancla. */
  function insertStage(current: MilestoneDraft[], stage: GoalPlanStage): MilestoneDraft[] {
    const index = resolveInsertIndex(
      stage.afterTitle,
      current.map((m) => m.title),
      pendingSuggestions,
    )
    const next = [...current]
    next.splice(index, 0, { title: stage.title, position: 0, targetDate: null, done: false })
    return renumberDrafts(next)
  }

  const commitmentError = validateCommitment(blocks)
  const canContinue = canContinueFrom(step, { title, commitmentError, milestones })
  const isLast = step === STEPS - 1
  let ctaLabel = 'Continuar'
  if (isLast) ctaLabel = saving ? 'Creando…' : 'Crear meta'

  return (
    // El color del área de la meta tiñe todo el asistente (días, etapas, resumen);
    // el azul queda para actuar y para el coach.
    <main
      className={`screen screen--full flow-screen wizard${step === 1 ? ' flow-screen--tipo' : ''}${step === 3 ? ' flow-screen--camino' : ''}`}
      style={nicheAccent(area)}
    >
      <div className="row wizard__top">
        <button type="button" className="back-link" onClick={goBack}>
          <IconChevronLeft size={18} />
          Atrás
        </button>
        <div className="stepper spacer" aria-hidden="true">
          {Array.from({ length: STEPS }, (_, i) => (
            <span
              key={i}
              className={`stepper__dot ${stepDotClass(i, step)}`}
            />
          ))}
        </div>
        {/* Orientación explícita: los puntos solos no dicen cuánto falta. */}
        <span className="tiny wizard__count">
          Paso {step + 1} de {STEPS}
        </span>
      </div>

      <div className="stack stack--lg" style={{ flex: 1 }}>
        {step === 0 && (
          <Question title="¿Qué quieres lograr?" hint={`Una frase clara. Ej: “Aprender inglés” o “Bajar 5${NBSP}kg”.`}>
            <input
              ref={focusOnMount}
              className="input"
              aria-label="¿Qué quieres lograr?"
              placeholder="Escribe tu meta…"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              maxLength={200}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && canContinue) next()
              }}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="next"
              inputMode="text"
            />
            <button
              type="button"
              className="btn--link row row--sm"
              style={{ alignSelf: 'flex-start', alignItems: 'center' }}
              onClick={() => navigate('/ideas')}
            >
              <IconLightbulb size={14} /> Ver ideas de metas
            </button>
          </Question>
        )}

        {step === 1 && (
          <Question
            title="¿Qué tipo de meta es?"
            hint="Te sugerimos uno por lo que escribiste. Cámbialo si no encaja."
          >
            <TypeStep
              templateKey={templateKey}
              suggestion={typeSuggestion}
              reading={typeReading === title}
              typeNote={typeNote}
              onPick={pickType}
              onTypeNote={changeTypeNote}
            />
          </Question>
        )}

        {step === 2 && (
          <Question
            title="¿Cuánto y cuándo cada semana?"
            hint="Elige los días y de qué hora a qué hora. Lo pones una vez y se aplica a todos los días que marques."
          >
            <CommitmentStep
              blocks={blocks}
              onChange={setBlocks}
              existing={existingBlocks}
              defaultMinutes={defaultMinutes}
              defaultStart={defaultStart}
            />
          </Question>
        )}
        {step === 2 && commitmentError && <p className="faint tiny">{commitmentError}</p>}

        {step === 3 && (
          <Question
            title="Arma tu camino"
            hint="Las etapas de tu meta, en orden. Escríbelas tú; el coach las revisa y te dice qué falta y dónde va."
          >
            <div className="camino">
              <aside className="camino__coach">
                <CoachPanel
                  input={{
                    title,
                    typeLabel,
                    area,
                    why,
                    targetDate,
                    // El horario del paso anterior es el tiempo real disponible.
                    weeklyMinutes,
                  }}
                  stageTitles={milestoneTitles}
                  plan={aiPlan}
                  onPlan={setAiPlan}
                  answers={aiAnswers}
                  onAnswers={setAiAnswers}
                  pendingCount={pendingSuggestions.length}
                  onAddAll={() => setMilestones((current) => pendingSuggestions.reduce((acc, stage) => insertStage(acc, stage), current))}
                  chat={chat}
                  inlineThread={isDesktop}
                  onOpenChat={() => setChatOpen(true)}
                />
              </aside>
              <div className="camino__main">
                <MilestonesStep
                  milestones={milestones}
                  onChange={setMilestones}
                  ghosts={pendingSuggestions.map((stage) => ({
                    stage,
                    index: resolveInsertIndex(stage.afterTitle, milestoneTitles, pendingSuggestions),
                  }))}
                  onAcceptGhost={(stage) => setMilestones((current) => insertStage(current, stage))}
                />
                <TemplateIdeas
                  titles={getTemplate(templateKey || 'personalizada').milestones.filter(
                    (t) => !milestoneTitles.some((m) => m.trim().toLowerCase() === t.trim().toLowerCase()),
                  )}
                  onAdd={(t) =>
                    setMilestones((current) =>
                      renumberDrafts([...current, { title: t, position: 0, targetDate: null, done: false }]),
                    )
                  }
                />
              </div>
            </div>
          </Question>
        )}

        {step === 4 && (
          <Question
            title="¿Por qué y para cuándo?"
            hint="Tu motivo, la fecha límite y cómo sabrás que la lograste. Los tres son opcionales."
          >
            <textarea
              ref={focusOnMount}
              className="textarea"
              aria-label="¿Por qué quieres lograrlo?"
              placeholder="Porque…"
              value={why}
              onChange={(e) => setWhy(e.target.value)}
              autoCapitalize="sentences"
              autoCorrect="on"
              enterKeyHint="enter"
            />
            <Hint id="wizard-why-2026-05">
              Tu motivo aparecerá bajo cada sesión de esta meta, como recordatorio en los días difíciles.
            </Hint>
            <input
              className="input"
              type="date"
              aria-label="¿Para cuándo?"
              min={todayISO()}
              value={targetDate}
              onChange={(e) => setTargetDate(e.target.value)}
            />
            {targetDate && (
              <button className="btn--link" type="button" onClick={() => setTargetDate('')}>
                Quitar fecha
              </button>
            )}
            <CriteriaSuggest
              context={chatContext}
              value={criteria}
              onChange={setCriteria}
              options={criteriaOptions}
              onOptions={setCriteriaOptions}
            />
          </Question>
        )}

        {step === 5 && (
          <Question
            title="Revisa tu meta"
            hint={
              blocks.length > 0
                ? 'Confirma los detalles. Al crearla, tus sesiones aparecerán en Hoy y en tu agenda según el horario que elegiste.'
                : 'Confirma los detalles.'
            }
          >
            <ReviewCard
              title={title}
              templateLabel={typeLabel}
              area={area}
              targetDate={targetDate}
              why={why}
              criteria={criteria}
            />
            {blocks.length > 0 ? (
              <div className="alert">Tu compromiso: {formatCommitmentSummary(blocks)}</div>
            ) : (
              <div className="alert">Sin agenda: la verás arriba en Hoy y podrás agregarle días cuando quieras.</div>
            )}
          </Question>
        )}
      </div>

      {/* CTA pegajoso: en pasos largos (tipos, horario) el botón queda siempre a la
          vista — elegir una opción no debe obligar a scrollear hasta el fondo. */}
      <div className="wizard-cta">
        {error && <div className="alert alert--error" style={{ marginBottom: 'var(--s3)' }}>{error}</div>}
        <div className="row" style={{ gap: 'var(--s3)', alignItems: 'center' }}>
          <button
            className="btn btn--primary btn--block"
            disabled={!canContinue || saving}
            onClick={isLast ? submit : next}
          >
            {ctaLabel}
          </button>
        </div>
      </div>

      {chatOpen && !isDesktop && (
        <Sheet label="Hablar con el coach" panelClassName="stack coach-sheet" onClose={() => setChatOpen(false)}>
          {(close) => (
            <>
              <div className="row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
                <CoachOrb thinking={chat.pending} />
                <div className="stack spacer" style={{ gap: 2 }}>
                  <strong>Coach de tu meta</strong>
                  <span className="small faint">Conoce tu camino y tus respuestas</span>
                </div>
                <button type="button" className="btn--link" onClick={close}>
                  Listo
                </button>
              </div>
              <CoachThread
                chat={chat}
                empty={<p className="small faint">Cuéntale qué ya hiciste, qué te frena o qué tiempo tienes de verdad. Él te propone cambios y tú decides.</p>}
              />
              {chat.messages.length === 0 && (
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  {['Ya tengo algo avanzado', 'Solo puedo los fines de semana', '¿Por qué en este orden?'].map((t) => (
                    <button key={t} type="button" className="chip" onClick={() => void chat.send(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <CoachComposer onSend={(t) => void chat.send(t)} disabled={chat.pending} autoFocus />
            </>
          )}
        </Sheet>
      )}
    </main>
  )
}

/** Punto del indicador de pasos: cumplido, actual o pendiente. */
function stepDotClass(i: number, current: number): string {
  if (i < current) return 'stepper__dot--done'
  if (i === current) return 'stepper__dot--active'
  return ''
}

/** ¿Se puede avanzar desde este paso? Los pasos sin requisito siempre dejan. */
function canContinueFrom(
  step: number,
  { title, commitmentError, milestones }: { title: string; commitmentError: string | null; milestones: MilestoneDraft[] },
): boolean {
  if (step === 0) return title.trim().length > 0
  if (step === 2) return commitmentError === null
  if (step === 3) return milestones.length > 0 && milestones.every((m) => m.title.trim().length > 0)
  return true
}

function Question({
  title,
  hint,
  children,
}: Readonly<{
  title: string
  hint?: string
  children: ReactNode
}>) {
  return (
    <section className="stack">
      <div>
        <h1 className="screen__title">{title}</h1>
        {hint && <p className="screen__subtitle">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

/** Resumen de la meta antes de crearla, en el último paso. */
function ReviewCard({
  title,
  templateLabel,
  area,
  targetDate,
  why,
  criteria,
}: Readonly<{
  title: string
  templateLabel: string
  area: NicheId
  targetDate: string
  why: string
  criteria: string
}>) {
  const cleanWhy = why.trim()
  const cleanCriteria = criteria.trim()
  const dateLabel = targetDate ? [formatLongDate(targetDate), relativeDeadline(targetDate)].filter(Boolean).join(' · ') : null
  return (
    <div className="fc-card wizard-review" style={nicheAccent(area)}>
      <div className="row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
        <NicheGlyph area={area} size="md" />
        <span className="wizard-review__kicker">Tu meta · {getNiche(area).label}</span>
      </div>
      <strong className="fc-card__title wizard-review__title">{title || '—'}</strong>
      <div className="row wrap" style={{ gap: 'var(--s2)' }}>
        <span className="tag">{templateLabel}</span>
        {dateLabel && (
          <span className="tag">
            <IconCalendar size={11} /> {dateLabel}
          </span>
        )}
      </div>
      {cleanWhy && (
        <div className="wizard-review__block">
          <span className="wizard-review__kicker">Tu porqué</span>
          <p className="fc-card__meta">{cleanWhy}</p>
        </div>
      )}
      {cleanCriteria && (
        <div className="wizard-review__block">
          <span className="wizard-review__kicker">Lo logras cuando</span>
          <p className="fc-card__meta">{cleanCriteria}</p>
        </div>
      )}
    </div>
  )
}

function renumberDrafts(list: MilestoneDraft[]): MilestoneDraft[] {
  return list.map((m, position) => ({ ...m, position }))
}

/** Etapas típicas del tipo de meta, plegadas: están si se buscan, no estorban. */
function TemplateIdeas({ titles, onAdd }: Readonly<{ titles: string[]; onAdd: (title: string) => void }>) {
  if (titles.length === 0) return null
  return (
    <details className="template-ideas">
      <summary className="small faint">Ver etapas típicas de este tipo de meta</summary>
      <div className="row wrap" style={{ gap: 'var(--s2)', marginTop: 'var(--s3)' }}>
        {titles.map((t) => (
          <button key={t} type="button" className="chip" onClick={() => onAdd(t)}>
            + {t}
          </button>
        ))}
      </div>
    </details>
  )
}
