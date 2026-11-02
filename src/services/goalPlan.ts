import type { ClarifyingQuestion, GoalPlan, GoalPlanInput } from '@/domain/goalPlan'
import type { ChatContext, ChatTurn, CoachReply, CriterionOption } from '@/domain/coachChat'
import type { GoalTypeSuggestion } from '@/domain/goalType'
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
  reply?: string
  proposal?: CoachReply['proposal']
  options?: CriterionOption[]
  type?: GoalTypeSuggestion
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

/** Un turno de conversación con el coach. Puede traer cambios propuestos. */
export async function requestChat(ctx: ChatContext, history: ChatTurn[], message: string): Promise<CoachReply> {
  const data = await callCoach({ ...ctx, action: 'chat', history, message })
  if (!data.reply) throw new Error(FALLBACK)
  return { reply: data.reply, proposal: data.proposal ?? null }
}

/** Tres formas de saber que la meta está lograda; `hint` guía las opciones. */
export async function requestCriteria(ctx: ChatContext, hint = ''): Promise<CriterionOption[]> {
  const data = await callCoach({ ...ctx, action: 'criteria', hint })
  return data.options ?? []
}

/**
 * Qué tipo de meta es según su título (una clave de las plantillas). Solo el
 * título: el porqué se pide más adelante, en el paso 4, así que aquí el
 * servidor recibe why: null.
 */
export async function requestGoalType(title: string): Promise<GoalTypeSuggestion> {
  const data = await callCoach({ title, why: null, action: 'type' })
  if (!data.type) throw new Error(FALLBACK)
  return data.type
}
