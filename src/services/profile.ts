import type { FocusMode, NicheId, Profile } from '@/lib/types'
import { supabase } from '@/lib/supabase'

interface ProfileRow {
  id: string
  focus_mode: string
  primary_niche: string | null
  onboarded_at: string | null
  preferred_moment: string | null
  default_session_minutes: number | null
  priority_goal_id: string | null
  created_at: string
}

function mapProfile(row: ProfileRow): Profile {
  return {
    id: row.id,
    focusMode: row.focus_mode as FocusMode,
    primaryNiche: (row.primary_niche as NicheId | null) ?? null,
    onboardedAt: row.onboarded_at,
    preferredMoment: (row.preferred_moment as Profile['preferredMoment']) ?? null,
    defaultSessionMinutes: row.default_session_minutes ?? null,
    priorityGoalId: row.priority_goal_id ?? null,
    createdAt: row.created_at,
  }
}

/**
 * Devuelve el perfil del usuario, creándolo si no existe. El trigger de la BD
 * normalmente ya lo creó al registrarse; este upsert es una red de seguridad
 * (p. ej. cuentas creadas antes de instalar el trigger).
 */
export async function ensureProfile(userId: string): Promise<Profile> {
  const existing = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle()
  if (existing.error) throw new Error(existing.error.message)
  if (existing.data) return mapProfile(existing.data as ProfileRow)

  const created = await supabase
    .from('profiles')
    .insert({ id: userId })
    .select('*')
    .single()
  if (created.error) throw new Error(created.error.message)
  return mapProfile(created.data as ProfileRow)
}

export interface OnboardingResult {
  focusMode: FocusMode
  primaryNiche: NicheId
}

/** Cierra el onboarding: guarda modo + nicho y marca onboarded_at. */
export async function completeOnboarding(
  userId: string,
  result: OnboardingResult,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      focus_mode: result.focusMode,
      primary_niche: result.primaryNiche,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}

/** Actualiza las preferencias editables del perfil: modo de foco + nicho. */
export async function updateProfilePrefs(
  userId: string,
  prefs: { focusMode: FocusMode; primaryNiche: NicheId },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ focus_mode: prefs.focusMode, primary_niche: prefs.primaryNiche })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}
