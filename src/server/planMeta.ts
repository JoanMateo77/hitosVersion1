/**
 * Handler de POST /api/plan-meta con firma Web (Request → Response). Lo monta
 * la función de Vercel (api/plan-meta.ts) y, en local, el middleware de Vite.
 * Las dependencias entran por parámetro para poder testearlo sin red.
 */
import type { GoalPlanInput } from '../domain/goalPlan'
import type { GoalPlanner } from './geminiPlanner'

export const DAILY_LIMIT = 10

export interface PlanMetaDeps {
  /** Devuelve el id del usuario dueño del token, o null si no es válido. */
  verifyUser(accessToken: string): Promise<string | null>
  planner: GoalPlanner | null
  /** Registra un uso y dice si el usuario sigue dentro del límite diario. */
  takeQuota(userId: string): boolean
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  })
}

function readInput(body: unknown): GoalPlanInput | null {
  if (body == null || typeof body !== 'object') return null
  const b = body as Record<string, unknown>
  if (typeof b.title !== 'string' || b.title.trim().length === 0) return null
  return {
    title: b.title,
    typeLabel: typeof b.typeLabel === 'string' ? b.typeLabel : '',
    why: typeof b.why === 'string' ? b.why : null,
    targetDate: typeof b.targetDate === 'string' ? b.targetDate : null,
  }
}

export async function handlePlanMeta(request: Request, deps: PlanMetaDeps): Promise<Response> {
  if (request.method !== 'POST') return json(405, { error: { code: 'method_not_allowed' } })
  if (!deps.planner) return json(503, { error: { code: 'ai_not_configured' } })

  const token = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ?? ''
  const userId = token ? await deps.verifyUser(token) : null
  if (!userId) return json(401, { error: { code: 'unauthenticated' } })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return json(400, { error: { code: 'invalid_body' } })
  }
  const input = readInput(body)
  if (!input) return json(400, { error: { code: 'invalid_body' } })

  if (!deps.takeQuota(userId)) return json(429, { error: { code: 'daily_limit' } })

  try {
    const plan = await deps.planner.plan(input)
    return json(200, { plan })
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
