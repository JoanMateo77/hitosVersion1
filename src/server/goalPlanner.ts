/**
 * GoalPlanner sobre la cadena de modelos (aiChain.ts). Corre SOLO en el
 * servidor (función de Vercel o middleware de Vite); las claves viven en la
 * cadena, nunca en el bundle del cliente. Imports relativos: ver nota en goalPlan.ts.
 */
import type { ModelChain } from './aiChain.js'
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
import { DAY_RESPONSE_SCHEMA, DAY_SYSTEM, buildDayPrompt, parseDayReply } from '../domain/dayPlanAi.js'
import type { DayAiContext, DayAiReply } from '../domain/dayPlanAi.js'
import { buildTypePrompt, parseTypeSuggestion, typeResponseSchema } from '../domain/goalType.js'
import type { GoalTypeSuggestion } from '../domain/goalType.js'
import { TEMPLATES } from '../domain/templates.js'

/** Contrato del coach. Los proveedores y su orden se eligen en la cadena. */
export interface GoalPlanner {
  questions(input: GoalPlanInput, signals: string[]): Promise<ClarifyingQuestion[]>
  plan(input: GoalPlanInput, signals: string[]): Promise<GoalPlan>
  refine(input: GoalPlanInput, plan: GoalPlan, instruction: string, signals: string[]): Promise<GoalPlan>
  /** Un turno de conversación; puede traer una propuesta (cambios a las etapas o un avance). */
  chat(ctx: ChatContext, history: ChatTurn[], message: string, signals: string[]): Promise<CoachReply>
  /** Formas de saber que la meta está lograda, opcionalmente guiadas por un pedido. */
  criteria(ctx: ChatContext, hint: string, signals: string[]): Promise<CriterionOption[]>
  /** Tipo de meta (una clave de las plantillas) a partir del título. */
  goalType(title: string, why: string | null): Promise<GoalTypeSuggestion>
  /** Un turno del asistente de agenda: entiende el día contado en texto libre. */
  day(ctx: DayAiContext, history: ChatTurn[], message: string): Promise<DayAiReply>
}


const TEMPLATE_KEYS = TEMPLATES.map((t) => t.key)
const TEMPLATE_CATALOG = TEMPLATES.map(({ key, label, description }) => ({ key, label, description }))

/** La corrección es una mejora opcional: no puede alargar la espera tanto como el plan. */
const REPAIR_BUDGET_MS = 15_000

export function createGoalPlanner(chain: ModelChain): GoalPlanner {
  /** Una llamada con JSON forzado por esquema, recorriendo la cadena de modelos. */
  const call = <T>(
    prompt: string,
    schema: object,
    parse: (raw: unknown) => T | null,
    budgetMs?: number,
    system: string = COACH_SYSTEM,
  ): Promise<T> => chain.run({ system, prompt, schema, budgetMs }, parse)

  /**
   * Genera y, si no pasa la revisión de realismo, pide UNA corrección. Al final
   * ancla cada sugerencia a la etapa tras la cual encaja.
   */
  async function planWithReview(prompt: string, input: GoalPlanInput): Promise<GoalPlan> {
    const parse = (raw: unknown) => parseGoalPlan(raw, minStagesFor(input))
    const first = await call(prompt, GOAL_PLAN_RESPONSE_SCHEMA, parse)
    const issues = checkPlanRealism(first, input)
    // Si la corrección falla (incluso si cae toda la cadena), el primer plan
    // sigue siendo usable: mejor eso que nada.
    const plan =
      issues.length === 0
        ? first
        : await call(buildRepairPrompt(prompt, issues), GOAL_PLAN_RESPONSE_SCHEMA, parse, REPAIR_BUDGET_MS).catch(
            () => first,
          )
    return anchorSuggestions(plan, input)
  }

  return {
    questions: (input, signals) =>
      call(buildQuestionsPrompt(input, signals), QUESTIONS_RESPONSE_SCHEMA, parseQuestions),
    plan: (input, signals) => planWithReview(buildGoalPlanPrompt(input, signals), input),
    refine: (input, plan, instruction, signals) =>
      planWithReview(buildRefinePrompt(input, plan, instruction, signals), input),
    chat: (ctx, history, message, signals) =>
      call(buildChatPrompt(ctx, history, message, signals), CHAT_RESPONSE_SCHEMA, (raw) =>
        parseCoachReply(raw, ctx.stages, ctx.canLogProgress === true),
      ),
    criteria: (ctx, hint, signals) =>
      call(buildCriteriaPrompt(ctx, hint, signals), CRITERIA_RESPONSE_SCHEMA, parseCriteria),
    goalType: (title, why) =>
      call(buildTypePrompt(title, why, TEMPLATE_CATALOG), typeResponseSchema(TEMPLATE_KEYS), (raw) =>
        parseTypeSuggestion(raw, TEMPLATE_KEYS),
      ),
    day: (ctx, history, message) =>
      call(buildDayPrompt(ctx, history, message), DAY_RESPONSE_SCHEMA, (raw) => parseDayReply(raw, ctx), undefined, DAY_SYSTEM),
  }
}
