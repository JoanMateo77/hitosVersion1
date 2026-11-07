/**
 * Handler de POST /api/plan-meta con firma Web (Request → Response). Lo monta
 * la función de Vercel (api/plan-meta.ts) y, en local, el middleware de Vite.
 * Las dependencias entran por parámetro para poder testearlo sin red.
 *
 * Acciones: "questions" (qué falta saber) · "plan" (camino con respuestas) ·
 * "refine" (pulir un plan con un pedido en lenguaje natural) · "chat" (un turno
 * de conversación con propuesta de cambios) · "criteria" (cómo saber que se logró) ·
 * "type" (qué tipo de meta es, según el título) · "day" (organizar la agenda
 * de un día a partir de texto libre; no necesita una meta).
 */
import { parseGoalPlan, type GoalPlanInput, type QuestionAnswer } from '../domain/goalPlan.js'
import { readHistory, readStages, type ChatContext, type ChatTurn } from '../domain/coachChat.js'
import { DAY_MAX_ITEMS, DAY_MESSAGE_MAX, readDayItem, type DayAiContext } from '../domain/dayPlanAi.js'
import { DAY_DEFAULTS, type DayItem } from '../domain/dayPlan.js'
import type { GoalPlanner } from './goalPlanner.js'

/**
 * Cada acción cuenta (preguntas, plan, pulidos, mensajes de chat). Generoso a
 * propósito en la etapa de pruebas; se ajusta con AI_DAILY_LIMIT.
 */
export const DAILY_LIMIT = 100

const ACTIONS = new Set(['questions', 'plan', 'refine', 'chat', 'criteria', 'type', 'day'])

export interface PlanMetaDeps {
  /** Devuelve el id del usuario dueño del token, o null si no es válido. */
  verifyUser(accessToken: string): Promise<string | null>
  planner: GoalPlanner | null
  /**
   * Registra un uso. null = el usuario superó el límite diario; si no, una
   * función que devuelve ESE uso (mismo día) cuando la IA no pudo responder.
   */
  takeQuota(userId: string): (() => void) | null
  /** Memoria de comportamiento en frases legibles ([] si no hay o falla). */
  loadSignals(userId: string, accessToken: string): Promise<string[]>
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

const str = (v: unknown) => (typeof v === 'string' ? v : null)

function readAnswers(value: unknown): QuestionAnswer[] {
  if (!Array.isArray(value)) return []
  return value
    .map((a) => (a != null && typeof a === 'object' ? (a as Record<string, unknown>) : null))
    .filter((a): a is Record<string, unknown> => a !== null)
    .map((a) => ({ question: str(a.question) ?? '', answer: str(a.answer) ?? '' }))
    .filter((a) => a.question && a.answer)
}

function readInput(b: Record<string, unknown>): GoalPlanInput | null {
  const title = str(b.title)
  if (!title || title.trim().length === 0) return null
  return {
    title,
    typeLabel: str(b.typeLabel) ?? '',
    area: str(b.area),
    why: str(b.why),
    targetDate: str(b.targetDate),
    weeklyMinutes: typeof b.weeklyMinutes === 'number' && b.weeklyMinutes > 0 ? b.weeklyMinutes : null,
    answers: readAnswers(b.answers),
    currentStages: Array.isArray(b.currentStages)
      ? b.currentStages.filter((t): t is string => typeof t === 'string')
      : [],
  }
}

/** Contexto de chat/criterio: la meta y sus etapas tal como las ve la persona. */
function readChatContext(b: Record<string, unknown>, input: GoalPlanInput): ChatContext {
  const stages = readStages(b.stages)
  return {
    ...input,
    stages: stages.length > 0 ? stages : readStages(input.currentStages),
    successCriteria: str(b.successCriteria),
    weekProgress: str(b.weekProgress),
    // Solo cambia el prompt y si se acepta la nota: registrar el avance lo
    // hace luego la persona con su sesión (RLS), no este servidor.
    canLogProgress: b.canLogProgress === true,
  }
}

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/
/** Lo que ya hay en el día más el borrador: existentes y nuevos, con margen. */
const DAY_MAX_CONTEXT_ITEMS = 60

/** Pedido de la acción "day", ya validado. */
interface DayRequest {
  action: 'day'
  ctx: DayAiContext
  history: ChatTurn[]
  message: string
}

/** null si el pedido de agenda no es válido. */
function readDayRequest(b: Record<string, unknown>): DayRequest | null {
  const date = str(b.date)
  const now = str(b.now)
  const message = str(b.message)?.trim() ?? ''
  if (!date || !ISO_DATE.test(date) || !now || !HHMM.test(now)) return null
  if (!message || message.length > DAY_MESSAGE_MAX) return null
  const time = (v: unknown, fallback: string) => (typeof v === 'string' && HHMM.test(v) ? v : fallback)
  const items = (Array.isArray(b.items) ? b.items : [])
    .map(readDayItem)
    .filter((i): i is DayItem => i !== null)
    .slice(0, DAY_MAX_CONTEXT_ITEMS + DAY_MAX_ITEMS)
  const goals = (Array.isArray(b.goals) ? b.goals : [])
    .map((g) => (g != null && typeof g === 'object' ? (g as Record<string, unknown>) : null))
    .filter((g): g is Record<string, unknown> => g !== null && typeof g.id === 'string' && typeof g.title === 'string')
    .map((g) => ({ id: g.id as string, title: (g.title as string).slice(0, 120) }))
    .slice(0, 20)
  return {
    action: 'day',
    ctx: { date, now, dayStart: time(b.dayStart, DAY_DEFAULTS.dayStart), dayEnd: time(b.dayEnd, DAY_DEFAULTS.dayEnd), items, goals },
    history: readHistory(b.history, DAY_MESSAGE_MAX),
    message,
  }
}

/** Pedido ya validado: la acción y los datos que necesita. */
interface CoachRequest {
  action: string
  input: GoalPlanInput
  body: Record<string, unknown>
  currentPlan: ReturnType<typeof parseGoalPlan>
  instruction: string
  message: string
}

async function readBody(request: Request): Promise<Record<string, unknown> | null> {
  try {
    const parsed: unknown = await request.json()
    return parsed != null && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : null
  } catch {
    return null
  }
}

/** null si el pedido no es válido para su acción. */
function readCoachRequest(body: Record<string, unknown>): CoachRequest | null {
  const input = readInput(body)
  // Sin acción = "plan"; una acción que no es texto no es válida (nada de "[object Object]").
  const action = body.action === undefined ? 'plan' : body.action
  if (!input || typeof action !== 'string' || !ACTIONS.has(action)) return null
  // Un plan a pulir puede tener 0 sugerencias ("tu camino está completo").
  const currentPlan = action === 'refine' ? parseGoalPlan(body.plan, 0) : null
  const instruction = str(body.instruction)?.trim() ?? ''
  const message = str(body.message)?.trim() ?? ''
  if (action === 'refine' && (!currentPlan || !instruction)) return null
  if (action === 'chat' && !message) return null
  return { action, input, body, currentPlan, instruction, message }
}

async function runAction(req: CoachRequest, planner: GoalPlanner, signals: () => Promise<string[]>): Promise<unknown> {
  const { action, input, body } = req
  // El tipo solo depende del título: no hace falta la memoria de comportamiento.
  if (action === 'type') return { type: await planner.goalType(input.title, input.why ?? null) }
  const lines = await signals()
  if (action === 'questions') return { questions: await planner.questions(input, lines), signals: lines }
  if (action === 'chat') {
    const reply = await planner.chat(readChatContext(body, input), readHistory(body.history), req.message, lines)
    return { ...reply, signals: lines }
  }
  if (action === 'criteria') {
    return { options: await planner.criteria(readChatContext(body, input), str(body.hint) ?? '', lines), signals: lines }
  }
  const plan =
    action === 'refine' && req.currentPlan
      ? await planner.refine(input, req.currentPlan, req.instruction, lines)
      : await planner.plan(input, lines)
  return { plan, signals: lines }
}

export async function handlePlanMeta(request: Request, deps: PlanMetaDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } })
  const planner = deps.planner
  if (!planner) return json(503, { error: { code: 'ai_not_configured' } })

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const userId = token ? await deps.verifyUser(token) : null
  if (!userId) return json(401, { error: { code: 'unauthenticated' } })

  const body = await readBody(request)
  const req = body && (body.action === 'day' ? readDayRequest(body) : readCoachRequest(body))
  if (!req) return json(400, { error: { code: 'invalid_body' } })

  const refundQuota = deps.takeQuota(userId)
  if (!refundQuota) return json(429, { error: { code: 'daily_limit' } })

  try {
    if (req.action === 'day') {
      // La agenda no usa la memoria de comportamiento de metas.
      const r = req as DayRequest
      return json(200, await planner.day(r.ctx, r.history, r.message))
    }
    return json(200, await runAction(req as CoachRequest, planner, () => deps.loadSignals(userId, token)))
  } catch (err) {
    console.error('[plan-meta] fallo del planner:', err instanceof Error ? err.message : 'desconocido')
    refundQuota()
    return json(502, { error: { code: 'ai_unavailable' } })
  }
}

/**
 * Devoluciones máximas por usuario y día. Sin tope, cuando la cadena entera
 * falla alguien podría reintentar sin fin a costa de la cuota gratuita de los
 * proveedores, que es compartida por todos.
 */
export const MAX_DAILY_REFUNDS = 10

/**
 * Límite diario EN MEMORIA: válido en local y en una sola instancia. Antes de
 * desplegar se reemplaza por una tabla (las funciones serverless no comparten
 * memoria). Ver el spec 2026-10-31-asistente-ia-etapas-design.md.
 */
export function createMemoryQuota(limit = DAILY_LIMIT, now = () => new Date(), maxRefunds = MAX_DAILY_REFUNDS) {
  const used = new Map<string, number>()
  const refunded = new Map<string, number>()
  return (userId: string): (() => void) | null => {
    // La clave se fija al cobrar: una devolución tras medianoche vuelve al día cobrado.
    const key = `${now().toISOString().slice(0, 10)}:${userId}`
    const count = used.get(key) ?? 0
    if (count >= limit) return null
    used.set(key, count + 1)
    let done = false
    return () => {
      const refunds = refunded.get(key) ?? 0
      if (done || refunds >= maxRefunds) return
      done = true
      refunded.set(key, refunds + 1)
      used.set(key, Math.max(0, (used.get(key) ?? 0) - 1))
    }
  }
}

/** Valida el access token contra Supabase Auth y devuelve el id del usuario. */
export function createSupabaseVerifier(supabaseUrl: string, anonKey: string) {
  return async (accessToken: string): Promise<string | null> => {
    const res = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    }).catch(() => null)
    if (!res?.ok) return null
    const user = (await res.json()) as { id?: unknown }
    return typeof user.id === 'string' ? user.id : null
  }
}
