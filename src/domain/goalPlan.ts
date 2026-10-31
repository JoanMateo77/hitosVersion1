/**
 * Plan de meta generado por IA (schemaVersion 1) y los prompts del coach.
 * Dominio puro: lo usan el servidor (prompts + validación) y el cliente (tipos).
 * Sin imports con alias "@/": el middleware de Vite lo carga desde
 * vite.config.ts, donde el alias no existe todavía.
 */
import { areaGuide } from './planningMethod'

export interface GoalPlanStage {
  title: string
  /** Qué cambia al terminar la etapa. */
  objective: string
  weeks: number
  /** 1–3 tareas concretas para arrancar la etapa. */
  firstActions: string[]
  /** Cómo sabe la persona que la etapa terminó. */
  successSignal: string
}

export interface GoalPlan {
  schemaVersion: 1
  summary: string
  weeklyMinutes: number
  stages: GoalPlanStage[]
  /** Solo al pulir: qué cambió respecto del plan anterior, en una frase. */
  changeNote?: string
}

export interface ClarifyingQuestion {
  question: string
  /** 2–4 respuestas rápidas; la persona también puede escribir la suya. */
  options: string[]
}

export interface QuestionAnswer {
  question: string
  answer: string
}

export interface GoalPlanInput {
  title: string
  /** Etiqueta del tipo de meta elegido en el wizard (p. ej. "Aprender un idioma"). */
  typeLabel: string
  /** Nicho de la meta (salud, finanzas…): elige la guía del método. */
  area?: string | null
  why?: string | null
  targetDate?: string | null
  /** Minutos por semana que la persona comprometió en el paso de horario (null = sin agenda). */
  weeklyMinutes?: number | null
  answers?: QuestionAnswer[]
}

export const MIN_STAGES = 3
export const MAX_STAGES = 6
export const MAX_QUESTIONS = 3
const MAX_TEXT = 200
const MAX_ACTIONS = 3

/**
 * Esquemas que se le pasan al modelo. Deliberadamente "mínimo común": sin
 * minItems/maxItems ni minLength (Anthropic los rechaza, Gemini los ignora);
 * los rangos los imponen los parsers de abajo, en el servidor.
 */
const STAGE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    title: { type: 'STRING' },
    objective: { type: 'STRING' },
    weeks: { type: 'INTEGER' },
    firstActions: { type: 'ARRAY', items: { type: 'STRING' } },
    successSignal: { type: 'STRING' },
  },
  required: ['title', 'objective', 'weeks', 'firstActions', 'successSignal'],
} as const

export const GOAL_PLAN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    weeklyMinutes: { type: 'INTEGER' },
    stages: { type: 'ARRAY', items: STAGE_SCHEMA },
    changeNote: { type: 'STRING' },
  },
  required: ['summary', 'weeklyMinutes', 'stages'],
} as const

export const QUESTIONS_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    questions: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          question: { type: 'STRING' },
          options: { type: 'ARRAY', items: { type: 'STRING' } },
        },
        required: ['question', 'options'],
      },
    },
  },
  required: ['questions'],
} as const

/** Recorta y normaliza un texto antes de meterlo en el prompt o devolverlo. */
function clean(text: string | null | undefined, max = MAX_TEXT): string {
  return (text ?? '').replace(/\s+/g, ' ').trim().slice(0, max)
}

/** Bloque de datos de la meta, siempre delimitado: el modelo lo trata como datos. */
function goalData(input: GoalPlanInput, signalLines: string[]): string[] {
  const lines = [`<meta>${clean(input.title)}</meta>`, `<tipo>${clean(input.typeLabel)}</tipo>`]
  const why = clean(input.why)
  if (why) lines.push(`<motivo>${why}</motivo>`)
  const date = clean(input.targetDate, 10)
  if (date) lines.push(`<fecha_limite>${date}</fecha_limite>`)
  if (input.weeklyMinutes && input.weeklyMinutes > 0) {
    lines.push(`<tiempo_semanal_comprometido>${Math.round(input.weeklyMinutes)} minutos</tiempo_semanal_comprometido>`)
  }
  for (const a of (input.answers ?? []).slice(0, MAX_QUESTIONS + 1)) {
    const q = clean(a.question)
    const ans = clean(a.answer)
    if (q && ans) lines.push(`<respuesta pregunta="${q.replace(/"/g, "'")}">${ans}</respuesta>`)
  }
  if (signalLines.length > 0) {
    lines.push(`<historial_en_la_app>${signalLines.map((l) => clean(l, 160)).join(' ')}</historial_en_la_app>`)
  }
  return lines
}

export function buildQuestionsPrompt(input: GoalPlanInput, signalLines: string[] = []): string {
  return [
    areaGuide(input.area ?? 'otra'),
    `Antes de planificar, decide qué te falta saber para que el plan sea realista. Haz entre 1 y ${MAX_QUESTIONS} preguntas cortas, las de mayor impacto (punto de partida, recursos, restricciones).`,
    'No preguntes lo que ya está en los datos (fecha, motivo, tiempo semanal comprometido, historial).',
    'Cada pregunta trae 2 a 4 opciones de respuesta breves y concretas (máx. 5 palabras cada una).',
    ...goalData(input, signalLines),
  ].join('\n')
}

export function buildGoalPlanPrompt(input: GoalPlanInput, signalLines: string[] = []): string {
  return [
    areaGuide(input.area ?? 'otra'),
    `Diseña el camino: entre ${MIN_STAGES} y ${MAX_STAGES} etapas en orden, específicas para ESTA meta y ESTA persona.`,
    'Cada etapa: título corto (máx. 8 palabras), objetivo en una frase, semanas estimadas, 1 a 3 primeras acciones que se hagan en una sesión, y una señal de éxito observable.',
    'summary: el enfoque en 1–2 frases, mencionando el punto de partida. weeklyMinutes: minutos por semana que el plan necesita (no más que el tiempo comprometido, si lo hay).',
    'No incluyas changeNote.',
    ...goalData(input, signalLines),
  ].join('\n')
}

export function buildRefinePrompt(
  input: GoalPlanInput,
  plan: GoalPlan,
  instruction: string,
  signalLines: string[] = [],
): string {
  return [
    areaGuide(input.area ?? 'otra'),
    'La persona quiere ajustar su plan. Aplica su pedido manteniendo el método; conserva lo que no hace falta cambiar.',
    'Devuelve el plan completo actualizado y en changeNote una frase que diga qué cambió.',
    ...goalData(input, signalLines),
    `<plan_actual>${JSON.stringify({ summary: plan.summary, weeklyMinutes: plan.weeklyMinutes, stages: plan.stages })}</plan_actual>`,
    `<pedido>${clean(instruction, 300)}</pedido>`,
  ].join('\n')
}

/** Instrucción de reparación cuando el plan no pasa la revisión de realismo. */
export function buildRepairPrompt(basePrompt: string, issues: string[]): string {
  return [
    basePrompt,
    'Tu propuesta anterior no pasó la revisión de realismo por esto:',
    ...issues.map((i) => `- ${i}`),
    'Corrígela y devuelve el plan completo.',
  ].join('\n')
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value != null && typeof value === 'object' && !Array.isArray(value)
}

function text(value: unknown, max = MAX_TEXT): string | null {
  if (typeof value !== 'string') return null
  const t = clean(value, max)
  return t.length > 0 ? t : null
}

function positiveInt(value: unknown, max: number): number | null {
  if (typeof value !== 'number' || !Number.isFinite(value)) return null
  const n = Math.round(value)
  return n >= 1 ? Math.min(n, max) : null
}

function parseStage(value: unknown): GoalPlanStage | null {
  if (!isRecord(value)) return null
  const title = text(value.title)
  const objective = text(value.objective)
  const successSignal = text(value.successSignal)
  const weeks = positiveInt(value.weeks, 104)
  if (!title || !objective || !successSignal || weeks === null) return null
  const firstActions = Array.isArray(value.firstActions)
    ? value.firstActions
        .map((a) => text(a))
        .filter((a): a is string => a !== null)
        .slice(0, MAX_ACTIONS)
    : []
  if (firstActions.length === 0) return null
  return { title, objective, weeks, firstActions, successSignal }
}

/**
 * Valida la respuesta del modelo. Las etapas inválidas se descartan; si quedan
 * menos de MIN_STAGES el plan entero se rechaza (null) y el servidor reintenta.
 */
export function parseGoalPlan(raw: unknown): GoalPlan | null {
  if (!isRecord(raw)) return null
  const summary = text(raw.summary, 400) ?? ''
  const weeklyMinutes = positiveInt(raw.weeklyMinutes, 2400) ?? 0
  if (!Array.isArray(raw.stages)) return null
  const stages = raw.stages
    .map(parseStage)
    .filter((s): s is GoalPlanStage => s !== null)
    .slice(0, MAX_STAGES)
  if (stages.length < MIN_STAGES) return null
  const plan: GoalPlan = { schemaVersion: 1, summary, weeklyMinutes, stages }
  const changeNote = text(raw.changeNote, 300)
  if (changeNote) plan.changeNote = changeNote
  return plan
}

export function parseQuestions(raw: unknown): ClarifyingQuestion[] | null {
  if (!isRecord(raw) || !Array.isArray(raw.questions)) return null
  const questions = raw.questions
    .map((q): ClarifyingQuestion | null => {
      if (!isRecord(q)) return null
      const question = text(q.question)
      const options = Array.isArray(q.options)
        ? q.options
            .map((o) => text(o, 60))
            .filter((o): o is string => o !== null)
            .slice(0, 4)
        : []
      return question && options.length >= 2 ? { question, options } : null
    })
    .filter((q): q is ClarifyingQuestion => q !== null)
    .slice(0, MAX_QUESTIONS)
  return questions.length > 0 ? questions : null
}

/** Semanas completas entre hoy y la fecha límite (yyyy-mm-dd), o null. */
function weeksUntil(targetDate: string | null | undefined, today: Date): number | null {
  if (!targetDate || !/^\d{4}-\d{2}-\d{2}$/.test(targetDate)) return null
  const ms = new Date(`${targetDate}T00:00:00Z`).getTime() - today.getTime()
  return Number.isFinite(ms) ? Math.max(0, Math.floor(ms / (7 * 24 * 3600 * 1000))) : null
}

/**
 * La "revisión" del coach, en código y no en otra llamada: verifica que el plan
 * quepa en el tiempo comprometido y en la fecha límite. Si hay problemas, el
 * servidor pide UNA corrección al modelo con estos mismos textos.
 */
export function checkPlanRealism(plan: GoalPlan, input: GoalPlanInput, today = new Date()): string[] {
  const issues: string[] = []
  const available = input.weeklyMinutes ?? 0
  if (available > 0 && plan.weeklyMinutes > available * 1.1) {
    issues.push(
      `Pide ${plan.weeklyMinutes} min por semana, pero la persona comprometió ${Math.round(available)}. Ajusta el plan a ese tiempo.`,
    )
  }
  const total = plan.stages.reduce((sum, s) => sum + s.weeks, 0)
  const weeks = weeksUntil(input.targetDate, today)
  if (weeks !== null && weeks > 0 && total > weeks + 1) {
    issues.push(
      `Las etapas suman ${total} semanas y solo quedan ${weeks} hasta la fecha límite. Comprime el camino o ajusta el alcance y dilo en el resumen.`,
    )
  }
  return issues
}
