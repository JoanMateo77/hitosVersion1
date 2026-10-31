/**
 * Carga la memoria de comportamiento del usuario desde Supabase con SU token:
 * las políticas RLS siguen aplicando (sin service_role). Si algo falla, el
 * coach sigue sin memoria en vez de romperse.
 */
import { computeUserSignals, describeSignals } from '../domain/userSignals'

const WINDOW_DAYS = 60

export function createSignalsLoader(supabaseUrl: string, anonKey: string) {
  async function get<T>(path: string, accessToken: string): Promise<T> {
    const res = await fetch(`${supabaseUrl}/rest/v1/${path}`, {
      headers: { apikey: anonKey, Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) throw new Error(`Supabase ${res.status}`)
    return (await res.json()) as T
  }

  return async (userId: string, accessToken: string): Promise<string[]> => {
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000).toISOString().slice(0, 10)
      const uid = encodeURIComponent(userId)
      const [sessions, schedule, goals, profiles] = await Promise.all([
        get<{ status: string }[]>(`sessions?select=status&user_id=eq.${uid}&session_date=gte.${since}`, accessToken),
        get<{ target_kind: string; target_value: number; goals: { status: string } | null }[]>(
          `goal_schedule?select=target_kind,target_value,goals!inner(status)&user_id=eq.${uid}&goals.status=eq.active`,
          accessToken,
        ),
        get<{ id: string }[]>(`goals?select=id&user_id=eq.${uid}&status=eq.active`, accessToken),
        get<{ preferred_moment: string | null }[]>(`profiles?select=preferred_moment&id=eq.${uid}`, accessToken),
      ])
      return describeSignals(
        computeUserSignals({
          sessionStatuses: sessions.map((s) => s.status),
          schedule: schedule.map((b) => ({ targetKind: b.target_kind, targetValue: b.target_value })),
          activeGoals: goals.length,
          preferredMoment: profiles[0]?.preferred_moment ?? null,
        }),
      )
    } catch (err) {
      console.error('[plan-meta] sin memoria del usuario:', err instanceof Error ? err.message : 'desconocido')
      return []
    }
  }
}
