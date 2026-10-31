/**
 * Adaptador Gemini del GoalPlanner. Corre SOLO en el servidor (función de
 * Vercel o middleware de Vite): recibe la clave por parámetro, nunca la lee
 * del bundle del cliente. Imports relativos: ver nota en goalPlan.ts.
 */
import { GOAL_PLAN_RESPONSE_SCHEMA, buildGoalPlanPrompt, parseGoalPlan } from '../domain/goalPlan'
import type { GoalPlan, GoalPlanInput } from '../domain/goalPlan'

export interface GoalPlanner {
  plan(input: GoalPlanInput): Promise<GoalPlan>
}

export class PlannerError extends Error {}

const ENDPOINT = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 20_000

interface GeminiResponse {
  candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[]
}

export function createGeminiPlanner(apiKey: string, model: string): GoalPlanner {
  async function attempt(input: GoalPlanInput): Promise<GoalPlan | null> {
    const res = await fetch(`${ENDPOINT}/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      signal: AbortSignal.timeout(TIMEOUT_MS),
      body: JSON.stringify({
        contents: [{ parts: [{ text: buildGoalPlanPrompt(input) }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: GOAL_PLAN_RESPONSE_SCHEMA,
          // Razonamiento bajo: el plan no lo necesita y es lo que más pesa en la latencia.
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: 4096,
        },
      }),
    })
    if (!res.ok) {
      // El cuerpo de error de Google no incluye la clave; igual solo logueamos el estado.
      throw new PlannerError(`Gemini respondió ${res.status}`)
    }
    const data = (await res.json()) as GeminiResponse
    const candidate = data.candidates?.[0]
    // Un JSON cortado por límite de tokens puede seguir siendo "válido": solo STOP cuenta.
    if (candidate?.finishReason !== 'STOP') return null
    const raw = candidate.content?.parts?.map((p) => p.text ?? '').join('') ?? ''
    try {
      return parseGoalPlan(JSON.parse(raw))
    } catch {
      return null
    }
  }

  return {
    async plan(input) {
      // Un reintento ante respuesta vacía, cortada o fuera de esquema.
      const plan = (await attempt(input)) ?? (await attempt(input))
      if (!plan) throw new PlannerError('El modelo no devolvió un plan válido')
      return plan
    },
  }
}
