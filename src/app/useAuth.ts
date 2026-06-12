import { useCallback, useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSession, onAuthChange } from '@/services/auth'

export interface AuthState {
  user: User | null
  loading: boolean
  /** true si la sesión entró por el enlace de "olvidé mi contraseña". */
  recovery: boolean
  clearRecovery: () => void
}

/** Estado de autenticación: sesión actual + suscripción a cambios (login/logout). */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)
  const [recovery, setRecovery] = useState(false)

  useEffect(() => {
    let active = true

    getSession()
      .then((session) => {
        if (active) setUser(session?.user ?? null)
      })
      .catch(() => {
        if (active) setUser(null)
      })
      .finally(() => {
        if (active) setLoading(false)
      })

    const unsubscribe = onAuthChange((nextUser, event) => {
      if (!active) return
      setUser(nextUser)
      if (event === 'PASSWORD_RECOVERY') setRecovery(true)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  const clearRecovery = useCallback(() => setRecovery(false), [])

  return { user, loading, recovery, clearRecovery }
}
