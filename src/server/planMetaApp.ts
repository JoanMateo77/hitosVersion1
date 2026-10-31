/**
 * Arma el handler con dependencias reales a partir de variables de entorno.
 * GEMINI_API_KEY no lleva prefijo VITE_: así Vite nunca la mete en el bundle.
 */
import { createGeminiPlanner } from './geminiPlanner'
import { createMemoryQuota, createSupabaseVerifier, handlePlanMeta } from './planMeta'

export const DEFAULT_GEMINI_MODEL = 'gemini-3.5-flash-lite'

export function createPlanMetaHandler(env: Record<string, string | undefined>) {
  const apiKey = env.GEMINI_API_KEY
  const planner = apiKey
    ? createGeminiPlanner(apiKey, env.GEMINI_MODEL || DEFAULT_GEMINI_MODEL)
    : null
  const verifyUser = createSupabaseVerifier(env.VITE_SUPABASE_URL ?? '', env.VITE_SUPABASE_ANON_KEY ?? '')
  const takeQuota = createMemoryQuota()
  return (request: Request) => handlePlanMeta(request, { planner, verifyUser, takeQuota })
}
