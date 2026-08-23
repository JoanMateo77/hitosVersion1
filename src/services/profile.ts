import type { FocusMode, NicheId, Profile } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import { listGoals } from '@/services/goals'
import { listScheduleForUser } from '@/services/schedule'
import { listSessionsInRange } from '@/services/sessions'
import { currentStreakCommitted } from '@/domain/sessions'
import { addDays, todayISO } from '@/lib/date'

interface ProfileRow {
  id: string
  focus_mode: string
  primary_niche: string | null
  onboarded_at: string | null
  preferred_moment: string | null
  default_session_minutes: number | null
  priority_goal_id: string | null
  /** Opcional: si la migración 0012 no se aplicó aún, `select *` no la trae. */
  avatar_url?: string | null
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
    avatarUrl: row.avatar_url ?? null,
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
  primaryNiche: NicheId | null
  preferredMoment: Profile['preferredMoment']
  defaultSessionMinutes: number | null
}

/** Cierra el onboarding: guarda foco + ritmo y marca onboarded_at. */
export async function completeOnboarding(
  userId: string,
  result: OnboardingResult,
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      primary_niche: result.primaryNiche,
      preferred_moment: result.preferredMoment,
      default_session_minutes: result.defaultSessionMinutes,
      onboarded_at: new Date().toISOString(),
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}

/** Actualiza "Tu ritmo": defaults que alimentan el wizard y los horarios. */
export async function updateRhythm(
  userId: string,
  rhythm: { preferredMoment: Profile['preferredMoment']; defaultSessionMinutes: number | null },
): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({
      preferred_moment: rhythm.preferredMoment,
      default_session_minutes: rhythm.defaultSessionMinutes,
    })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}

/* ===== Foto de perfil ====================================================== */

const AVATAR_MAX_PX = 512
const AVATAR_JPEG_QUALITY = 0.85

/** Redimensiona la imagen en el cliente (máx 512px de lado) y la pasa a JPEG. */
async function resizeToJpeg(file: File): Promise<Blob> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error('No pudimos leer esa imagen. Prueba con otro archivo.'))
      el.src = objectUrl
    })
    const scale = Math.min(1, AVATAR_MAX_PX / Math.max(img.width, img.height))
    const width = Math.max(1, Math.round(img.width * scale))
    const height = Math.max(1, Math.round(img.height * scale))
    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('No pudimos procesar la imagen en este navegador.')
    // Fondo blanco: los PNG con transparencia no quedan negros al pasar a JPEG.
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, width, height)
    ctx.drawImage(img, 0, 0, width, height)
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', AVATAR_JPEG_QUALITY),
    )
    if (!blob) throw new Error('No pudimos procesar la imagen. Prueba con otra foto.')
    return blob
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

/**
 * Sube la foto de perfil: redimensiona client-side, la guarda en el bucket
 * 'avatars' bajo la carpeta del usuario (lo exige la política RLS) y actualiza
 * profiles.avatar_url con la URL pública (con ?v= para romper caché al cambiarla).
 */
export async function uploadAvatar(userId: string, file: File): Promise<Profile> {
  if (!file.type.startsWith('image/')) {
    throw new Error('El archivo debe ser una imagen (JPG, PNG…).')
  }
  const blob = await resizeToJpeg(file)
  const path = `${userId}/avatar.jpg`
  const uploaded = await supabase.storage
    .from('avatars')
    .upload(path, blob, { upsert: true, contentType: 'image/jpeg', cacheControl: '3600' })
  if (uploaded.error) {
    throw new Error(`No se pudo subir la foto: ${uploaded.error.message}`)
  }
  const { data: pub } = supabase.storage.from('avatars').getPublicUrl(path)
  const url = `${pub.publicUrl}?v=${Date.now()}`
  const { data, error } = await supabase
    .from('profiles')
    .update({ avatar_url: url })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(`La foto subió pero no se pudo guardar en tu perfil: ${error.message}`)
  return mapProfile(data as ProfileRow)
}

/* ===== Racha para el marco ================================================= */

/**
 * Racha actual sobre días comprometidos, con la MISMA métrica que Progreso
 * (currentStreakCommitted sobre bloques de metas activas). Se carga hasta un
 * año de sesiones para que el marco Leyenda (≥50) pueda calcularse completo.
 */
export async function fetchCurrentStreak(userId: string): Promise<number> {
  const today = todayISO()
  const [goals, blocks, sessions] = await Promise.all([
    listGoals(userId),
    listScheduleForUser(userId),
    listSessionsInRange(userId, addDays(today, -364), today),
  ])
  const activeGoalIds = new Set(goals.filter((g) => g.status === 'active').map((g) => g.id))
  const activeBlocks = blocks.filter((b) => activeGoalIds.has(b.goalId))
  const doneDates = new Set(
    sessions.filter((s) => s.status === 'done' || s.status === 'partial').map((s) => s.date),
  )
  const committedWeekdays = new Set(activeBlocks.map((b) => b.weekday))
  return currentStreakCommitted(doneDates, committedWeekdays, today)
}

/** Fija o quita la meta prioritaria (ordena el día; no oculta nada). */
export async function updatePriorityGoal(userId: string, goalId: string | null): Promise<Profile> {
  const { data, error } = await supabase
    .from('profiles')
    .update({ priority_goal_id: goalId })
    .eq('id', userId)
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return mapProfile(data as ProfileRow)
}
