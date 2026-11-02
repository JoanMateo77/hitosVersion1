/**
 * Handler de POST /api/plan-meta con firma Web (Request → Response). Lo monta
 * la función de Vercel (api/plan-meta.ts) y, en local, el middleware de Vite.
 * Las dependencias entran por parámetro para poder testearlo sin red.
 *
 * Acciones: "questions" (qué falta saber) · "plan" (camino con respuestas) ·
 * "refine" (pulir un plan con un pedido en lenguaje natural) · "chat" (un turno
 * de conversación con propuesta de cambios) · "criteria" (cómo saber que se logró) ·
 * "type" (qué tipo de meta es, según el título).
 */
import { parseGoalPlan, type GoalPlanInput, type QuestionAnswer } from '../domain/goalPlan.js'
import { readHistory, readStages, type ChatContext } from '../domain/coachChat.js'
import type { GoalPlanner } from './geminiPlanner.js'

/**
 * Cada acción cuenta (preguntas, plan, pulidos, mensajes de chat). Generoso a
 * propósito en la etapa de pruebas; se ajusta con AI_DAILY_LIMIT.
 */
export const DAILY_LIMIT = 100

const ACTIONS = ['questions', 'plan', 'refine', 'chat', 'criteria', 'type']

export interface PlanMetaDeps {
  /** Devuelve el id del usuario dueño del token, o null si no es válido. */
  verifyUser(accessToken: string): Promise<string | null>
  planner: GoalPlanner | null
  /** Registra un uso y dice si el usuario sigue dentro del límite diario. */
  takeQuota(userId: string): boolean
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

export async function handlePlanMeta(request: Request, deps: PlanMetaDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } })
  if (!deps.planner) return json(503, { error: { code: 'ai_not_configured' } })

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const userId = token ? await deps.verifyUser(token) : null
  if (!userId) return json(401, { error: { code: 'unauthenticated' } })

  let body: Record<string, unknown>
  try {
    const parsed: unknown = await request.json()
    if (parsed == null || typeof parsed !== 'object') throw new Error('body')
    body = parsed as Record<string, unknown>
  } catch {
    return json(400, { error: { code: 'invalid_body' } })
  }
  const input = readInput(body)
  const action = body.action ?? 'plan'
  // Un plan a pulir puede tener 0 sugerencias ("tu camino está completo").
  const currentPlan = action === 'refine' ? parseGoalPlan(body.plan, 0) : null
  const instruction = str(body.instruction)?.trim() ?? ''
  const message = str(body.message)?.trim() ?? ''
  if (
    !input ||
    !ACTIONS.includes(String(action)) ||
    (action === 'refine' && (!currentPlan || !instruction)) ||
    (action === 'chat' && !message)
  ) {
    return json(400, { error: { code: 'invalid_body' } })
  }

  if (!deps.takeQuota(userId)) return json(429, { error: { code: 'daily_limit' } })

  try {
    // El tipo solo depende del título: no hace falta la memoria de comportamiento.
    if (action === 'type') {
      return json(200, { type: await deps.planner.goalType(input.title, input.why ?? null) })
    }
    const signals = await deps.loadSignals(userId, token)
    if (action === 'questions') {
      return json(200, { questions: await deps.planner.questions(input, signals), signals })
    }
    if (action === 'chat') {
      const ctx = readChatContext(body, input)
      return json(200, { ...(await deps.planner.chat(ctx, readHistory(body.history), message, signals)), signals })
    }
    if (action === 'criteria') {
      const ctx = readChatContext(body, input)
      return json(200, { options: await deps.planner.criteria(ctx, str(body.hint) ?? '', signals), signals })
    }
    const plan =
      action === 'refine' && currentPlan
        ? await deps.planner.refine(input, currentPlan, instruction, signals)
        : await deps.planner.plan(input, signals)
    return json(200, { plan, signals })
  } catch (err) {
    console.error('[plan-meta] fallo del planner:', err instanceof Error ? err.message : 'desconocido')
    return json(502, { error: { code: 'ai_unavailable' } })
  }
}

/**
 * Límite diario EN MEMORIA: válido en local y en una sola instancia. Antes de
 * desplegar se reemplaza por una tabla (las funciones serverless no comparten
 * memoria). Ver el spec 2026-10-31-asistente-ia-etapas-design.md.
 */
export function createMemoryQuota(limit = DAILY_LIMIT, now = () => new Date()) {
  const used = new Map<string, number>()
  return (userId: string): boolean => {
    const key = `${now().toISOString().slice(0, 10)}:${userId}`
    const count = used.get(key) ?? 0
    if (count >= limit) return false
    used.set(key, count + 1)
    return true
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
