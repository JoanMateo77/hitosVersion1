/**
 * Arma el handler con dependencias reales a partir de variables de entorno.
 * Las claves de IA no llevan prefijo VITE_: así Vite nunca las mete en el bundle.
 */
import { createModelChain, parseChain, realChainOptions } from './aiChain.js'
import { createGoalPlanner } from './goalPlanner.js'
import { DAILY_LIMIT, createMemoryQuota, createSupabaseVerifier, handlePlanMeta } from './planMeta.js'
import { createSupabaseQuota } from './quotaStore.js'
import { createSignalsLoader } from './userSignalsLoader.js'

export function createPlanMetaHandler(env: Record<string, string | undefined>) {
  // Una sola cadena por instancia: el enfriamiento de modelos caídos se comparte
  // entre peticiones de la misma instancia.
  const links = parseChain(env)
  const planner = links.length > 0 ? createGoalPlanner(createModelChain(links, realChainOptions())) : null
  const url = env.VITE_SUPABASE_URL ?? ''
  const anonKey = env.VITE_SUPABASE_ANON_KEY ?? ''
  const verifyUser = createSupabaseVerifier(url, anonKey)
  const loadSignals = createSignalsLoader(url, anonKey)
  const parsed = Number(env.AI_DAILY_LIMIT)
  const limit = Number.isInteger(parsed) && parsed > 0 ? parsed : DAILY_LIMIT
  // Cuenta en la tabla ai_usage; si la base no responde, en memoria por instancia.
  const takeQuota = createSupabaseQuota(url, anonKey, limit, createMemoryQuota(limit))
  return (request: Request) => handlePlanMeta(request, { planner, verifyUser, takeQuota, loadSignals })
}
