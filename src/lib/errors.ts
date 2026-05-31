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
