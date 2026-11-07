/**
 * Límite diario de IA guardado en Supabase (migración 0020): las funciones
 * serverless no comparten memoria, así que el conteo vive en la tabla
 * `ai_usage`. Se llama con el token de la persona (sin service_role); las
 * funciones `ai_quota_take` / `ai_quota_refund` cobran y devuelven de forma
 * atómica y solo sobre su propia fila.
 *
 * Si la base no responde (o la migración aún no corre), se usa el límite en
 * memoria: la IA sigue funcionando con el control por instancia de antes.
 */

/** Devuelve un uso ya cobrado (cuando la IA no pudo responder). */
export type QuotaRefund = () => void | Promise<void>
export type MemoryTake = (userId: string) => QuotaRefund | null
export type TakeQuota = (userId: string, accessToken: string) => Promise<QuotaRefund | null>

const TIMEOUT_MS = 5_000

export function createSupabaseQuota(supabaseUrl: string, anonKey: string, limit: number, fallback: MemoryTake): TakeQuota {
  async function rpc(name: string, accessToken: string, body: object): Promise<unknown> {
    const res = await fetch(`${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: 'POST',
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}`)
    const text = await res.text()
    return text ? JSON.parse(text) : null
  }

  return async (userId, accessToken) => {
    let day: unknown
    try {
      day = await rpc('ai_quota_take', accessToken, { p_limit: limit })
    } catch (err) {
      console.error('[plan-meta] cuota en memoria (la base no respondió):', err instanceof Error ? err.message : 'desconocido')
      return fallback(userId)
    }
    // null = ya usó todo lo del día.
    if (typeof day !== 'string') return null
    let done = false
    return async () => {
      if (done) return
      done = true
      try {
        await rpc('ai_quota_refund', accessToken, { p_day: day })
      } catch (err) {
        console.error('[plan-meta] no se pudo devolver el uso:', err instanceof Error ? err.message : 'desconocido')
      }
    }
  }
}
