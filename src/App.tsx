import { useEffect, useState } from 'react'
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { isSupabaseConfigured } from '@/lib/supabase'
import { useAuth } from '@/app/useAuth'
import { SessionProvider } from '@/app/session'
import { ensureProfile } from '@/services/profile'
import type { Profile } from '@/lib/types'
import { LoadingScreen } from '@/components/LoadingScreen'
import { AppShell } from '@/components/AppShell'
import { ConfigNeeded } from '@/screens/ConfigNeeded'
import { Auth } from '@/screens/Auth'
import { Onboarding } from '@/screens/Onboarding'
import { Wizard } from '@/screens/Wizard'
import { GoalCreated } from '@/screens/GoalCreated'
import { GoalSuggestions } from '@/screens/GoalSuggestions'
import { Today } from '@/screens/Today'
import { Goals } from '@/screens/Goals'
import { GoalDetail } from '@/screens/GoalDetail'
import { Calendar } from '@/screens/Calendar'
import { Review } from '@/screens/Review'
import { ProfileScreen } from '@/screens/Profile'

/**
 * Punto de entrada de la app. Resuelve las capas en orden:
 *   1) ¿Hay claves de Supabase?  -> si no, pantalla de configuración.
 *   2) ¿Hay sesión?              -> si no, pantalla de login.
 *   3) ¿Hay perfil cargado?      -> lo asegura y lo provee por contexto.
 *   4) ¿Completó el onboarding?  -> si no, lo manda a /onboarding.
 */
export default function App() {
  if (!isSupabaseConfigured) {
    return (
      <div className="app">
        <ConfigNeeded />
      </div>
    )
  }
  return <AuthedApp />
}

function AuthedApp() {
  const { user, loading } = useAuth()

  if (loading) {
    return (
      <div className="app">
        <LoadingScreen />
      </div>
    )
  }
  if (!user) {
    return (
      <div className="app">
        <Auth />
      </div>
    )
  }
  return <ProfiledApp userId={user.id} email={user.email ?? ''} />
}

function ProfiledApp({ userId, email }: { userId: string; email: string }) {
  const [profile, setProfile] = useState<Profile | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    ensureProfile(userId)
      .then((p) => active && setProfile(p))
      .catch((e: unknown) =>
        active && setError(e instanceof Error ? e.message : 'No se pudo cargar tu perfil.'),
      )
    return () => {
      active = false
    }
  }, [userId])

  if (error) {
    return (
      <div className="app">
        <LoadingScreen error={error} />
      </div>
    )
  }
  if (!profile) {
    return (
      <div className="app">
        <LoadingScreen />
      </div>
    )
  }

  const onboarded = Boolean(profile.onboardedAt)

  return (
    <SessionProvider value={{ userId, email, profile, setProfile }}>
      <div className="app">
        <Routes>
          <Route
            path="/onboarding"
            element={onboarded ? <Navigate to="/" replace /> : <Onboarding />}
          />
          <Route element={<RequireOnboarded onboarded={onboarded} />}>
            <Route path="/meta/nueva" element={<Wizard />} />
            <Route path="/meta/creada/:goalId" element={<GoalCreated />} />
            <Route path="/ideas" element={<GoalSuggestions />} />
            <Route path="/revision" element={<Review />} />
            <Route element={<AppShell />}>
              <Route path="/" element={<Today />} />
              <Route path="/metas" element={<Goals />} />
              <Route path="/metas/:goalId" element={<GoalDetail />} />
              <Route path="/calendario" element={<Calendar />} />
              <Route path="/perfil" element={<ProfileScreen />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </SessionProvider>
  )
}

/** Bloquea el acceso a la app hasta completar el onboarding. */
function RequireOnboarded({ onboarded }: { onboarded: boolean }) {
  if (!onboarded) return <Navigate to="/onboarding" replace />
  return <Outlet />
}
