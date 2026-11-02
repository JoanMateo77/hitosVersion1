/**
 * Adaptador Gemini del GoalPlanner. Corre SOLO en el servidor (función de
 * Vercel o middleware de Vite): recibe la clave por parámetro, nunca la lee
 * del bundle del cliente. Imports relativos: ver nota en goalPlan.ts.
 */
import {
  GOAL_PLAN_RESPONSE_SCHEMA,
  QUESTIONS_RESPONSE_SCHEMA,
  anchorSuggestions,
  buildGoalPlanPrompt,
  buildQuestionsPrompt,
  buildRefinePrompt,
  buildRepairPrompt,
  checkPlanRealism,
  minStagesFor,
  parseGoalPlan,
  parseQuestions,
} from '../domain/goalPlan.js'
import type { ClarifyingQuestion, GoalPlan, GoalPlanInput } from '../domain/goalPlan.js'
import {
  CHAT_RESPONSE_SCHEMA,
  CRITERIA_RESPONSE_SCHEMA,
  buildChatPrompt,
  buildCriteriaPrompt,
  parseCoachReply,
  parseCriteria,
} from '../domain/coachChat.js'
import type { ChatContext, ChatTurn, CoachReply, CriterionOption } from '../domain/coachChat.js'
import { COACH_SYSTEM } from '../domain/planningMethod.js'
import { buildTypePrompt, parseTypeSuggestion, typeResponseSchema } from '../domain/goalType.js'
import type { GoalTypeSuggestion } from '../domain/goalType.js'
import { TEMPLATES } from '../domain/templates.js'

/** Contrato del coach: cambiar de proveedor = otra implementación de esto. */
export interface GoalPlanner {
  questions(input: GoalPlanInput, signals: string[]): Promise<ClarifyingQuestion[]>
  plan(input: GoalPlanInput, signals: string[]): Promise<GoalPlan>
  refine(input: GoalPlanInput, plan: GoalPlan, instruction: string, signals: string[]): Promise<GoalPlan>
  /** Un turno de conversación; puede traer una propuesta de cambios a las etapas. */
  chat(ctx: ChatContext, history: ChatTurn[], message: string, signals: string[]): Promise<CoachReply>
  /** Formas de saber que la meta está lograda, opcionalmente guiadas por un pedido. */
  criteria(ctx: ChatContext, hint: string, signals: string[]): Promise<CriterionOption[]>
  /** Tipo de meta (una clave de las plantillas) a partir del título. */
  goalType(title: string, why: string | null): Promise<GoalTypeSuggestion>
}

export class PlannerError extends Error {}

const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key)
const TEMPLATE_CATALOG = TEMPLATES.map(({ key, label, description }) => ({ key, label, description }))

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 20_000

interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
}

export function createGeminiPlanner(apiKey: string, model: string): GoalPlanner {
  /** Una llamada con JSON forzado por esquema; null si la respuesta no sirve. */
  async function call<T>(prompt: string, schema: object, parse: (raw: unknown) => T | null): Promise<T | null> {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        // El método va como instrucción de sistema fija: prefijo estable para el
        // caché implícito del proveedor y separado de los datos de la persona.
        systemInstruction: { parts: [{ text: COACH_SYSTEM }] },
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: schema,
          // Razonamiento bajo: es lo que más pesa en la latencia.
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 4096,
        },
      }),
    })
    if (!res.ok) throw new PlannerError(`Gemini respondió ${res.status}`)
    const data = (await res.json()) as GeminiResponse
    const candidate = data.candidates?.[0]
    // Un JSON cortado por límite de tokens puede seguir siendo "válido": solo STOP cuenta.
    if (candidate?.finishReason !== 'STOP') return null
    const raw = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      return parse(JSON.parse(raw))
    } catch {
      return null
    }
  }

  /** Un reintento ante respuesta vacía, cortada o fuera de esquema. */
  async function callWithRetry<T>(prompt: string, schema: object, parse: (raw: unknown) => T | null): Promise<T> {
    const result = (await call(prompt, schema, parse)) ?? (await call(prompt, schema, parse))
    if (result === null) throw new PlannerError('El modelo no devolvió una respuesta válida')
    return result
  }

  /**
   * Genera y, si no pasa la revisión de realismo, pide UNA corrección. Al final
   * ancla cada sugerencia a la etapa tras la cual encaja.
   */
  async function planWithReview(prompt: string, input: GoalPlanInput): Promise<GoalPlan> {
    const parse = (raw: unknown) => parseGoalPlan(raw, minStagesFor(input))
    const first = await callWithRetry(prompt, GOAL_PLAN_RESPONSE_SCHEMA, parse)
    const issues = checkPlanRealism(first, input)
    // Si la corrección falla, el primer plan sigue siendo usable: mejor eso que nada.
    const plan =
      issues.length === 0
        ? first
        : ((await call(buildRepairPrompt(prompt, issues), GOAL_PLAN_RESPONSE_SCHEMA, parse)) ?? first)
    return anchorSuggestions(plan, input)
  }

  return {
    questions: (input, signals) =>
      callWithRetry(buildQuestionsPrompt(input, signals), QUESTIONS_RESPONSE_SCHEMA, parseQuestions),
    plan: (input, signals) => planWithReview(buildGoalPlanPrompt(input, signals), input),
    refine: (input, plan, instruction, signals) =>
      planWithReview(buildRefinePrompt(input, plan, instruction, signals), input),
    chat: (ctx, history, message, signals) =>
      callWithRetry(buildChatPrompt(ctx, history, message, signals), CHAT_RESPONSE_SCHEMA, (raw) =>
        parseCoachReply(raw, ctx.stages),
      ),
    criteria: (ctx, hint, signals) =>
      callWithRetry(buildCriteriaPrompt(ctx, hint, signals), CRITERIA_RESPONSE_SCHEMA, parseCriteria),
    goalType: (title, why) =>
      callWithRetry(buildTypePrompt(title, why, TEMPLATE_CATALOG), typeResponseSchema(TEMPLATE_KEYS), (raw) =>
        parseTypeSuggestion(raw, TEMPLATE_KEYS),
      ),
  }
}
