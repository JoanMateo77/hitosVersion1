/**
 * ¿El error corresponde a una violación de unicidad de Postgres (23505)?
 *
 * Supabase puede devolver el error como PostgrestError (`{ code: '23505', ... }`)
 * o, tras re-lanzarlo, como `Error` con `code` adjunto. Inspeccionamos ambos de
 * forma defensiva con casts acotados porque el valor llega como `unknown`.
 */
export function isUniqueViolation(err: unknown): boolean {
  if (err == null || typeof err !== 'object') return false
  const code = (err as { code?: unknown }).code
  if (code === '23505') return true
  const message = (err as { message?: unknown }).message
  return typeof message === 'string' && message.toLowerCase().includes('duplicate key value')
}

/**
 * Traduce errores técnicos (red, sesión expirada, RLS) a un mensaje claro en
 * español. Para todo lo demás devuelve el `fallback` del caller, que ya viene
 * con contexto ("No se pudo cargar tu día."). Nunca exponemos el mensaje crudo.
 */
export function friendlyError(err: unknown, fallback: string): string {
  const message =
    err instanceof Error ? err.message : typeof err === 'string' ? err : ''
  const m = message.toLowerCase()
  if (m.includes('failed to fetch') || m.includes('network') || m.includes('load failed'))
    return 'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.'
  if (m.includes('jwt') || m.includes('refresh token') || m.includes('pgrst301'))
    return 'Tu sesión expiró. Vuelve a entrar para continuar.'
  if (m.includes('permission denied') || m.includes('row-level security') || m.includes('42501'))
    return 'No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.'
  return fallback
}
