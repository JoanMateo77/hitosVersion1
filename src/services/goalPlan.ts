import type { ClarifyingQuestion, GoalPlan, GoalPlanInput } from '@/domain/goalPlan'
import { getSession } from '@/services/auth'

/** Mensajes por código de error del servidor (lo que ve la persona). */
const ERRORS: Record<string, string> = {
  daily_limit: 'Ya usaste tus sugerencias de hoy. Mañana tendrás más.',
  ai_not_configured: 'Las sugerencias con IA no están disponibles en este momento.',
  unauthenticated: 'Tu sesión expiró. Vuelve a entrar para pedir sugerencias.',
}
const FALLBACK = 'No pudimos generar sugerencias ahora. Usa las ideas de abajo o escribe las tuyas.'

interface CoachResponse {
  questions?: ClarifyingQuestion[]
  plan?: GoalPlan
  /** Lo que el coach tuvo en cuenta de tu historial, en frases legibles. */
  signals?: string[]
  error?: { code?: string }
}

/**
 * Llama al coach del servidor. La clave de la IA vive en el servidor; aquí solo
 * viaja el token de sesión para que el servidor sepa quién pide.
 */
async function callCoach(body: Record<string, unknown>): Promise<CoachResponse> {
  const session = await getSession()
  const res = await fetch('/api/plan-meta', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session?.access_token ?? ''}`,
    },
    body: JSON.stringify(body),
  }).catch(() => null)
  if (!res) throw new Error(FALLBACK)
  const data = (await res.json().catch(() => null)) as CoachResponse | null
  if (res.ok && data) return data
  throw new Error(ERRORS[data?.error?.code ?? ''] ?? FALLBACK)
}

export async function requestQuestions(input: GoalPlanInput): Promise<ClarifyingQuestion[]> {
  const data = await callCoach({ ...input, action: 'questions' })
  return data.questions ?? []
}

export async function requestGoalPlan(input: GoalPlanInput): Promise<{ plan: GoalPlan; signals: string[] }> {
  const data = await callCoach({ ...input, action: 'plan' })
  if (!data.plan) throw new Error(FALLBACK)
  return { plan: data.plan, signals: data.signals ?? [] }
}

export async function refineGoalPlan(
  input: GoalPlanInput,
  plan: GoalPlan,
  instruction: string,
): Promise<{ plan: GoalPlan; signals: string[] }> {
  const data = await callCoach({ ...input, action: 'refine', plan, instruction })
  if (!data.plan) throw new Error(FALLBACK)
  return { plan: data.plan, signals: data.signals ?? [] }
}
