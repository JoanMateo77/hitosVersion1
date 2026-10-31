import type { GoalPlan, GoalPlanInput } from '@/domain/goalPlan'
import { getSession } from '@/services/auth'

/** Mensajes por código de error del servidor (lo que ve la persona). */
const ERRORS: Record<string, string> = {
  daily_limit: 'Ya usaste tus sugerencias de hoy. Mañana tendrás más.',
  ai_not_configured: 'Las sugerencias con IA no están disponibles en este momento.',
  unauthenticated: 'Tu sesión expiró. Vuelve a entrar para pedir sugerencias.',
}
const FALLBACK = 'No pudimos generar sugerencias ahora. Usa las ideas de abajo o escribe las tuyas.'

/**
 * Pide al servidor un plan de etapas para la meta. La clave de la IA vive en el
 * servidor; aquí solo viaja el token de sesión para que el servidor sepa quién pide.
 */
export async function requestGoalPlan(input: GoalPlanInput): Promise<GoalPlan> {
  const session = await getSession()
  const res = await fetch('/api/plan-meta', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(input),
  }).catch(() => null)
  if (!res) throw new Error(FALLBACK)
  const body = (await res.json().catch(() => null)) as
    | { plan?: GoalPlan; error?: { code?: string } }
    | null
  if (res.ok && body?.plan) return body.plan
  throw new Error(ERRORS[body?.error?.code ?? ''] ?? FALLBACK)
}
