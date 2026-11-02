import { supabase } from '@/lib/supabase'
import { parseGoalPlan, type GoalPlan, type QuestionAnswer } from '@/domain/goalPlan'
import type { StageProposal } from '@/domain/coachChat'

/**
 * Memoria del coach por meta: el plan que propuso la IA, las respuestas de la
 * persona y la conversación (migración 0018). Todo degrada en silencio si la
 * migración aún no corrió: el coach sigue funcionando, solo no recuerda.
 */

export type ProposalStatus = 'pending' | 'applied' | 'dismissed'

export interface CoachMessage {
  id: string
  role: 'user' | 'coach'
  text: string
  proposal: (StageProposal & { status: ProposalStatus }) | null
  createdAt: string
}

interface MessageRow {
  id: string
  role: string
  body: string
  proposal: unknown
  created_at: string
}

export interface GoalAi {
  plan: GoalPlan | null
  answers: QuestionAnswer[]
}

function warn(what: string, err: unknown) {
  console.warn(`[coach] ${what} no disponible (¿falta la migración 0018?):`, err instanceof Error ? err.message : err)
}

function readAnswers(value: unknown): QuestionAnswer[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (a): a is QuestionAnswer =>
      a != null && typeof a === 'object' && typeof a.question === 'string' && typeof a.answer === 'string',
  )
}

function readProposal(value: unknown): CoachMessage['proposal'] {
  if (value == null || typeof value !== 'object') return null
  const p = value as Record<string, unknown>
  if (typeof p.summary !== 'string' || !Array.isArray(p.changes)) return null
  const status: ProposalStatus = p.status === 'applied' || p.status === 'dismissed' ? p.status : 'pending'
  return { summary: p.summary, changes: p.changes as StageProposal['changes'], status }
}

function mapMessage(row: MessageRow): CoachMessage {
  return {
    id: row.id,
    role: row.role === 'coach' ? 'coach' : 'user',
    text: row.body,
    proposal: readProposal(row.proposal),
    createdAt: row.created_at,
  }
}

export async function getGoalAi(goalId: string): Promise<GoalAi> {
  const { data, error } = await supabase.from('goals').select('ai_plan, ai_answers').eq('id', goalId).maybeSingle()
  if (error) {
    warn('ai_plan', error)
    return { plan: null, answers: [] }
  }
  const row = (data ?? {}) as { ai_plan?: unknown; ai_answers?: unknown }
  // El plan guardado puede tener 0 sugerencias pendientes: mínimo 0.
  return { plan: row.ai_plan ? parseGoalPlan(row.ai_plan, 0) : null, answers: readAnswers(row.ai_answers) }
}

export async function saveGoalAi(goalId: string, ai: GoalAi): Promise<void> {
  const { error } = await supabase
    .from('goals')
    .update({ ai_plan: ai.plan, ai_answers: ai.answers })
    .eq('id', goalId)
  if (error) warn('guardar ai_plan', error)
}

export async function listCoachMessages(goalId: string): Promise<CoachMessage[]> {
  const { data, error } = await supabase
    .from('goal_coach_messages')
    .select('id, role, body, proposal, created_at')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) {
    warn('conversación', error)
    return []
  }
  return (data as MessageRow[]).map(mapMessage)
}

/** Guarda mensajes en orden. Devuelve los guardados (vacío si no se pudo). */
export async function addCoachMessages(
  userId: string,
  goalId: string,
  messages: { role: 'user' | 'coach'; text: string; proposal?: CoachMessage['proposal'] }[],
): Promise<CoachMessage[]> {
  if (messages.length === 0) return []
  const { data, error } = await supabase
    .from('goal_coach_messages')
    .insert(
      messages.map((m) => ({
        user_id: userId,
        goal_id: goalId,
        role: m.role,
        body: m.text.slice(0, 2000),
        proposal: m.proposal ?? null,
      })),
    )
    .select('id, role, body, proposal, created_at')
  if (error) {
    warn('guardar conversación', error)
    return []
  }
  return (data as MessageRow[]).map(mapMessage)
}

export async function setProposalStatus(
  messageId: string,
  proposal: NonNullable<CoachMessage['proposal']>,
): Promise<void> {
  const { error } = await supabase.from('goal_coach_messages').update({ proposal }).eq('id', messageId)
  if (error) warn('actualizar propuesta', error)
}
