import type { Session, User } from '@supabase/supabase-js'
import { supabase } from '@/lib/supabase'

/** Traduce los errores de auth de Supabase a mensajes claros en español. */
function translateAuthError(message: string): string {
  const m = message.toLowerCase()
  if (m.includes('invalid login credentials')) return 'Email o contraseña incorrectos.'
  if (m.includes('user already registered')) return 'Ya existe una cuenta con ese email.'
  if (m.includes('password should be at least')) return 'La contraseña debe tener al menos 6 caracteres.'
  if (m.includes('unable to validate email')) return 'Revisá que el email sea válido.'
  if (m.includes('email not confirmed')) return 'Tenés que confirmar tu email antes de entrar.'
  if (
    m.includes('for security purposes') ||
    m.includes('rate limit') ||
    m.includes('too many requests')
  )
    return 'Demasiados intentos. Esperá un momento y volvé a probar.'
  if (m.includes('network') || m.includes('failed to fetch'))
    return 'Hubo un problema de conexión. Revisá tu internet y probá de nuevo.'
  // Fallback genérico en español: nunca exponemos el mensaje crudo en inglés.
  return 'Algo salió mal. Probá de nuevo en un momento.'
}

/** Crea la cuenta. Indica si quedó pendiente de confirmar email (sin sesión inmediata). */
export async function signUp(
  email: string,
  password: string,
): Promise<{ needsConfirmation: boolean }> {
  const { data, error } = await supabase.auth.signUp({ email, password })
  if (error) throw new Error(translateAuthError(error.message))
  return { needsConfirmation: data.session === null }
}

export async function signIn(email: string, password: string): Promise<void> {
  const { error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) throw new Error(translateAuthError(error.message))
}

export async function resetPassword(email: string): Promise<void> {
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${window.location.origin}/`,
  })
  if (error) throw new Error(translateAuthError(error.message))
}

export async function signOut(): Promise<void> {
  const { error } = await supabase.auth.signOut()
  if (error) throw new Error(error.message)
}

export async function getSession(): Promise<Session | null> {
  const { data, error } = await supabase.auth.getSession()
  if (error) throw new Error(error.message)
  return data.session
}

/** Suscribe a cambios de sesión (login/logout/refresh). Devuelve un unsubscribe. */
export function onAuthChange(cb: (user: User | null) => void): () => void {
  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    cb(session?.user ?? null)
  })
  return () => data.subscription.unsubscribe()
}
