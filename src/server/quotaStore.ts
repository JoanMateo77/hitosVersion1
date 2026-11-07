/**
 * Límite diario de IA guardado en Supabase (migraciones 0020 y 0021): las
 * funciones serverless no comparten memoria, así que el conteo vive en la
 * tabla `ai_usage`. Se llama con el token de la persona (sin service_role).
 * `ai_quota_take` cobra de forma atómica y devuelve el id secreto del cobro;
 * solo el servidor lo conoce, y `ai_quota_refund` lo exige: nadie puede
 * devolverse usos llamando a la función por su cuenta.
 *
 * Si la base no responde (o la migración aún no corre), se usa el límite en
 * memoria: la IA sigue funcionando con el control por instancia de antes.
 */

/** Devuelve un uso ya cobrado (cuando la IA no pudo responder). */
export type QuotaRefund = () => void | Promise<void>
export type MemoryTake = (userId: string) => QuotaRefund | null
export type TakeQuota = (userId: string, accessToken: string) => Promise<QuotaRefund | null>

const TIMEOUT_MS = 5_000
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

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
    let charge: unknown
    try {
      charge = await rpc('ai_quota_take', accessToken, { p_limit: limit })
      // null = ya usó todo lo del día.
      if (charge === null) return null
      if (typeof charge !== 'string' || !UUID.test(charge)) throw new Error('respuesta inesperada (¿falta la migración 0021?)')
    } catch (err) {
      console.error('[plan-meta] cuota en memoria (la base no respondió):', err instanceof Error ? err.message : 'desconocido')
      return fallback(userId)
    }
    let done = false
    return async () => {
      if (done) return
      done = true
      try {
        await rpc('ai_quota_refund', accessToken, { p_charge: charge })
      } catch (err) {
        console.error('[plan-meta] no se pudo devolver el uso:', err instanceof Error ? err.message : 'desconocido')
      }
    }
  }
}
