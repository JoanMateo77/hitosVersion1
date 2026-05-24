import { createContext, useContext } from 'react'
import type { Profile } from '@/lib/types'

export interface SessionValue {
  userId: string
  email: string
  profile: Profile
  /** Actualiza el perfil en memoria tras el onboarding o cambios de ajustes. */
  setProfile: (profile: Profile) => void
}

const SessionContext = createContext<SessionValue | null>(null)

export const SessionProvider = SessionContext.Provider

/** Acceso tipado a la sesión. Lanza si se usa fuera del provider (bug de dev). */
export function useSession(): SessionValue {
  const value = useContext(SessionContext)
  if (!value) throw new Error('useSession debe usarse dentro de <SessionProvider>')
  return value
}
