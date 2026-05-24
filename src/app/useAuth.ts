import { useEffect, useState } from 'react'
import type { User } from '@supabase/supabase-js'
import { getSession, onAuthChange } from '@/services/auth'

export interface AuthState {
  user: User | null
  loading: boolean
}

/** Estado de autenticación: sesión actual + suscripción a cambios (login/logout). */
export function useAuth(): AuthState {
  const [user, setUser] = useState<User | null>(null)
  const [loading, setLoading] = useState(true)

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

    const unsubscribe = onAuthChange((nextUser) => {
      if (active) setUser(nextUser)
    })

    return () => {
      active = false
      unsubscribe()
    }
  }, [])

  return { user, loading }
}
