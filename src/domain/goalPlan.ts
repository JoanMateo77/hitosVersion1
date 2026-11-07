/**
 * Plan de meta generado por IA (schemaVersion 1) y los prompts del coach.
 * Dominio puro: lo usan el servidor (prompts + validación) y el cliente (tipos).
 * Sin imports con alias "@/": el middleware de Vite lo carga desde
 * vite.config.ts, donde el alias no existe todavía.
 */
import { areaGuide } from './planningMethod.js'
import { asData } from './promptData.js'

export interface GoalPlanStage {
  title: string
  /** Qué cambia al terminar la etapa. */
  objective: string
  weeks: number
  /** 1–3 tareas concretas para arrancar la etapa. */
  firstActions: string[]
  /** Cómo sabe la persona que la etapa terminó. */
  successSignal: string
  /** Posición propuesta por el modelo: después de la etapa N de la persona (0 = al inicio). */
  insertAfter?: number
  /**
   * Ancla resuelta en el servidor: título de la etapa (de la persona o de otra
   * sugerencia) tras la cual encaja; null = al inicio. Sobrevive a reordenar.
   */
  afterTitle?: string | null
  /** Por qué falta esta etapa y por qué va ahí, en una frase. */
  reason?: string
}

export interface GoalPlan {
  schemaVersion: 1
  summary: string
  weeklyMinutes: number
  stages: GoalPlanStage[]
  /** Solo al pulir: qué cambió respecto del plan anterior, en una frase. */
  changeNote?: string
  /** 0–2 observaciones sobre las etapas que la persona ya escribió. */
  notes?: string[]
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
  /** Etapas que la persona ya escribió, en orden: el coach completa, no repite. */
  currentStages?: string[]
}

export const MIN_STAGES = 3
export const MAX_STAGES = 6
export const MAX_QUESTIONS = 3
/** Sugerencias máximas cuando la persona ya tiene etapas propias. */
export const MAX_ADDITIONS = 4
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
    insertAfter: { type: 'INTEGER' },
    reason: { type: 'STRING' },
  },
  required: ['title', 'objective', 'weeks', 'firstActions', 'successSignal', 'insertAfter', 'reason'],
} as const

export const GOAL_PLAN_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    summary: { type: 'STRING' },
    weeklyMinutes: { type: 'INTEGER' },
    stages: { type: 'ARRAY', items: STAGE_SCHEMA },
    changeNote: { type: 'STRING' },
    notes: { type: 'ARRAY', items: { type: 'STRING' } },
  },
  required: ['summary', 'weeklyMinutes', 'stages', 'notes'],
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

function currentStages(input: GoalPlanInput): string[] {
  return (input.currentStages ?? [])
    .map((t) => asData(t))
    .filter(Boolean)
    .slice(0, 12)
}

/** Reglas de posición y de "no repetir": comunes a planear y pulir. */
function stageRules(input: GoalPlanInput): string[] {
  if (currentStages(input).length === 0) {
    return [
      `Diseña el camino: entre ${MIN_STAGES} y ${MAX_STAGES} etapas en orden, específicas para ESTA meta y ESTA persona.`,
      'insertAfter: 0 en todas (la persona aún no tiene etapas). reason: qué aporta la etapa, en una frase. notes: lista vacía.',
    ]
  }
  return [
    'La persona ya escribió etapas (en <etapas_actuales>, numeradas desde 1). Analiza ese camino con el método: qué falta, qué está fuera de orden, qué es vago.',
    `NO repitas ni reformules ninguna etapa existente, ni una que diga casi lo mismo con otras palabras. Sugiere SOLO las que faltan: entre 0 y ${MAX_ADDITIONS}. Si el camino está completo, devuelve 0.`,
    'insertAfter: número de la etapa existente después de la cual va la sugerencia (0 = antes de la primera). reason: por qué falta y por qué va en esa posición, en una frase.',
    'notes: 0 a 2 observaciones breves sobre las etapas existentes (orden, vaguedad, dos que se pisan). Refiérete a ellas por su número.',
  ]
}

/**
 * Fecha de hoy y semanas hasta la fecha límite: sin esto el modelo no sabe
 * cuánto plazo hay y arma caminos que no lo cubren o no caben.
 */
export function timeData(targetDate: string | null | undefined, today: Date): string[] {
  const lines = [`<hoy>${today.toISOString().slice(0, 10)}</hoy>`]
  const date = asData(targetDate, 10)
  if (date) lines.push(`<fecha_limite>${date}</fecha_limite>`)
  const weeks = weeksUntil(date, today)
  if (weeks !== null) lines.push(`<semanas_disponibles>${weeks}</semanas_disponibles>`)
  return lines
}

/** Bloque de datos de la meta, siempre delimitado: el modelo lo trata como datos. */
function goalData(input: GoalPlanInput, signalLines: string[], today: Date): string[] {
  const lines = [`<meta>${asData(input.title)}</meta>`, `<tipo>${asData(input.typeLabel)}</tipo>`]
  const why = asData(input.why)
  if (why) lines.push(`<motivo>${why}</motivo>`)
  lines.push(...timeData(input.targetDate, today))
  if (input.weeklyMinutes && input.weeklyMinutes > 0) {
    lines.push(`<tiempo_semanal_comprometido>${Math.round(input.weeklyMinutes)} minutos</tiempo_semanal_comprometido>`)
  }
  for (const a of (input.answers ?? []).slice(0, MAX_QUESTIONS + 1)) {
    const q = asData(a.question)
    const ans = asData(a.answer)
    if (q && ans) lines.push(`<respuesta pregunta="${q.replaceAll('"', "'")}">${ans}</respuesta>`)
  }
  const current = currentStages(input)
  if (current.length > 0) {
    const numbered = current.map((t, i) => `${i + 1}. ${t}`).join(' | ')
    lines.push(`<etapas_actuales>${numbered}</etapas_actuales>`)
  }
  if (signalLines.length > 0) {
    lines.push(`<historial_en_la_app>${signalLines.map((l) => asData(l, 160)).join(' ')}</historial_en_la_app>`)
  }
  return lines
}

export function buildQuestionsPrompt(input: GoalPlanInput, signalLines: string[] = [], today = new Date()): string {
  return [
    areaGuide(input.area ?? 'otra'),
    `Antes de planificar, decide qué te falta saber para que el plan sea realista. Haz entre 1 y ${MAX_QUESTIONS} preguntas cortas, las de mayor impacto (punto de partida, recursos, restricciones).`,
    'Si la meta es una cantidad (dinero, kilos, kilómetros, páginas), una pregunta es cuánto lleva ya.',
    'No preguntes lo que ya está en los datos (fecha, motivo, tiempo semanal comprometido, historial).',
    'Cada pregunta trae 2 a 4 opciones de respuesta breves y concretas (máx. 5 palabras cada una).',
    ...goalData(input, signalLines, today),
  ].join('\n')
}

/** Reglas de contenido del camino: comunes a planear y pulir. */
const PLAN_RULES = [
  'Cada etapa: título corto (máx. 8 palabras), objetivo en una frase, semanas estimadas, 1 a 3 primeras acciones que se hagan en una sesión, y una señal de éxito observable.',
  'Si hay <semanas_disponibles>, las semanas de las etapas suman aproximadamente ese número: el camino cubre el plazo, sin pasarse ni quedarse corto.',
  'Si la meta es una cantidad (dinero, kilos, kilómetros, páginas), calcula el ritmo necesario (por mes o por semana) con el plazo y compáralo con lo que la persona contó. Escribe montos y ritmos concretos en las acciones. Si no alcanza, dilo en summary con los números y arma el camino más cercano posible.',
  'Cada respuesta de la persona tiene que notarse en al menos una etapa o en summary; no ignores ninguna.',
  'La última etapa se valida con una prueba real fuera de la app (otra persona, un examen, un resultado verificable), no solo con una simulación.',
]

export function buildGoalPlanPrompt(input: GoalPlanInput, signalLines: string[] = [], today = new Date()): string {
  return [
    areaGuide(input.area ?? 'otra'),
    ...stageRules(input),
    ...PLAN_RULES,
    'summary: el enfoque en 1–2 frases, mencionando el punto de partida. weeklyMinutes: minutos por semana que el plan necesita (no más que el tiempo comprometido, si lo hay).',
    'No incluyas changeNote.',
    ...goalData(input, signalLines, today),
  ].join('\n')
}

export function buildRefinePrompt(
  input: GoalPlanInput,
  plan: GoalPlan,
  instruction: string,
  signalLines: string[] = [],
  today = new Date(),
): string {
  return [
    areaGuide(input.area ?? 'otra'),
    'La persona quiere ajustar las sugerencias. Aplica su pedido manteniendo el método; conserva lo que no hace falta cambiar.',
    ...stageRules(input),
    ...PLAN_RULES,
    'Devuelve todas las sugerencias actualizadas y en changeNote una frase que diga qué cambió.',
    ...goalData(input, signalLines, today),
    `<plan_actual>${JSON.stringify({ summary: plan.summary, weeklyMinutes: plan.weeklyMinutes, stages: plan.stages }).replaceAll('<', '‹').replaceAll('>', '›')}</plan_actual>`,
    `<pedido>${asData(instruction, 300)}</pedido>`,
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
  const stage: GoalPlanStage = { title, objective, weeks, firstActions, successSignal }
  if (typeof value.insertAfter === 'number' && Number.isFinite(value.insertAfter)) {
    stage.insertAfter = Math.max(0, Math.round(value.insertAfter))
  }
  if (value.afterTitle === null) stage.afterTitle = null
  else if (typeof value.afterTitle === 'string') stage.afterTitle = text(value.afterTitle)
  const reason = text(value.reason, 240)
  if (reason) stage.reason = reason
  return stage
}

/**
 * Valida la respuesta del modelo. Las etapas inválidas se descartan; si quedan
 * menos del mínimo el plan entero se rechaza (null) y el servidor reintenta.
 * Con etapas propias de la persona el mínimo es 0: "tu camino está completo".
 */
export function parseGoalPlan(raw: unknown, minStages = MIN_STAGES): GoalPlan | null {
  if (!isRecord(raw)) return null
  const summary = text(raw.summary, 400) ?? ''
  const weeklyMinutes = positiveInt(raw.weeklyMinutes, 2400) ?? 0
  if (!Array.isArray(raw.stages)) return null
  const stages = raw.stages
    .map(parseStage)
    .filter((s): s is GoalPlanStage => s !== null)
    .slice(0, MAX_STAGES)
  if (stages.length < minStages) return null
  const plan: GoalPlan = { schemaVersion: 1, summary, weeklyMinutes, stages }
  const changeNote = text(raw.changeNote, 300)
  if (changeNote) plan.changeNote = changeNote
  const notes = Array.isArray(raw.notes)
    ? raw.notes
        .map((n) => text(n, 240))
        .filter((n): n is string => n !== null)
        .slice(0, 2)
    : []
  if (notes.length > 0) plan.notes = notes
  return plan
}

/** Mínimo de etapas que debe traer una respuesta según el camino actual. */
export function minStagesFor(input: GoalPlanInput): number {
  return currentStages(input).length > 0 ? 0 : MIN_STAGES
}

/**
 * Convierte la posición numérica del modelo en un ancla por título, que no se
 * rompe si la persona reordena o agrega etapas. Varias sugerencias para el mismo
 * hueco se encadenan en orden (la 2ª va tras la 1ª); sin etapas propias, todas
 * forman una cadena desde el inicio. También descarta sugerencias que repiten
 * literalmente una etapa existente.
 */
export function anchorSuggestions(plan: GoalPlan, input: GoalPlanInput): GoalPlan {
  const current = currentStages(input)
  const existing = new Set(current.map((t) => t.toLowerCase()))
  const lastInGap = new Map<number, string>()
  const stages = plan.stages
    .filter((s) => !existing.has(s.title.toLowerCase()))
    .map((s) => {
      const gap = current.length === 0 ? 0 : Math.min(s.insertAfter ?? current.length, current.length)
      const base = gap === 0 ? null : current[gap - 1]
      const afterTitle = lastInGap.get(gap) ?? base
      lastInGap.set(gap, s.title)
      return { ...s, afterTitle }
    })
  return { ...plan, stages }
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

/** Un camino que usa menos de esta fracción del plazo deja la meta sin plan al final. */
const UNDERUSE_RATIO = 0.6

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
  // Con etapas propias (sin semanas) la suma no describe el camino entero.
  if (currentStages(input).length === 0 && weeks !== null && weeks > 0) {
    if (total > weeks + 1) {
      issues.push(
        `Las etapas suman ${total} semanas y solo quedan ${weeks} hasta la fecha límite. Comprime el camino o ajusta el alcance y dilo en el resumen.`,
      )
    } else if (total < weeks * UNDERUSE_RATIO) {
      issues.push(
        `Las etapas suman ${total} semanas y quedan ${weeks} hasta la fecha límite. Reparte el camino en todo el plazo (más semanas por etapa o una etapa más) en vez de dejarlo sin usar.`,
      )
    }
  }
  return issues
}

/**
 * Índice donde insertar una sugerencia en la lista actual de la persona:
 * null = al inicio; un título existente = justo después; el título de otra
 * sugerencia aún no agregada = donde iría esa (se resuelve en cadena); sin ancla
 * o ancla perdida (la persona la borró o renombró) = al final.
 */
export function resolveInsertIndex(
  afterTitle: string | null | undefined,
  titles: readonly string[],
  suggestions: readonly GoalPlanStage[],
  depth = 0,
): number {
  if (afterTitle === null) return 0
  if (afterTitle === undefined || depth > MAX_STAGES) return titles.length
  const key = afterTitle.trim().toLowerCase()
  const found = titles.findIndex((t) => t.trim().toLowerCase() === key)
  if (found >= 0) return found + 1
  const parent = suggestions.find((s) => s.title.trim().toLowerCase() === key)
  return parent ? resolveInsertIndex(parent.afterTitle, titles, suggestions, depth + 1) : titles.length
}
