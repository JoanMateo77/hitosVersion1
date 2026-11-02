import type { Goal } from '@/lib/types'
import { supabase } from '@/lib/supabase'
import {
  COVER_BUCKET,
  COVER_MAX_UPLOAD_BYTES,
  COVER_URL_TTL_S,
  coverDimensions,
  coverInputError,
  coverPath,
  isOwnCoverPath,
  type CoverMime,
} from '@/lib/goalCover'
import { setGoalCoverPath } from '@/services/goals'
import { UserMessageError } from '@/lib/errors'

/* ===== Re-codificación en el cliente ======================================= */

/** Calidades a probar, de mejor a peor, hasta quedar bajo el límite de subida. */
const QUALITIES = [0.8, 0.68, 0.55]

function loadImage(file: Blob): Promise<HTMLImageElement> {
  const objectUrl = URL.createObjectURL(file)
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image()
    el.onload = () => resolve(el)
    el.onerror = () => reject(new UserMessageError('No pudimos leer esa imagen. Prueba con otra foto.'))
    el.src = objectUrl
  }).finally(() => URL.revokeObjectURL(objectUrl))
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: CoverMime, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, mime, quality))
}

/**
 * Codifica el canvas en WebP; si el navegador no sabe (Safari devuelve PNG),
 * en JPEG. Prueba calidades decrecientes hasta pesar ≤ 1.5 MB.
 */
async function encodeCanvas(canvas: HTMLCanvasElement): Promise<{ blob: Blob; mime: CoverMime }> {
  for (const mime of ['image/webp', 'image/jpeg'] as const) {
    for (const quality of QUALITIES) {
      const blob = await canvasToBlob(canvas, mime, quality)
      if (blob?.type !== mime) break // este navegador no codifica ese formato
      if (blob.size <= COVER_MAX_UPLOAD_BYTES) return { blob, mime }
    }
  }
  throw new UserMessageError('No pudimos reducir la foto lo suficiente. Prueba con otra imagen.')
}

/**
 * Redimensiona a 1600 px de lado mayor y re-codifica con canvas. Dibujar en un
 * canvas y exportarlo descarta los metadatos EXIF (incluida la ubicación GPS):
 * lo que se sube son solo los píxeles.
 */
export async function reencodeCover(file: File): Promise<{ blob: Blob; mime: CoverMime }> {
  const inputError = coverInputError(file)
  if (inputError) throw new UserMessageError(inputError)
  const img = await loadImage(file)
  const { width, height } = coverDimensions(img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new UserMessageError('No pudimos procesar la imagen en este navegador.')
  // Fondo neutro: un PNG transparente no queda negro al pasar a JPEG.
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, width, height)
  ctx.drawImage(img, 0, 0, width, height)
  return encodeCanvas(canvas)
}

/* ===== Storage ============================================================== */

/** uid de la sesión activa (la ruta nunca se arma con datos que manda la UI). */
async function sessionUid(): Promise<string> {
  const { data } = await supabase.auth.getSession()
  const uid = data.session?.user.id
  if (!uid) throw new UserMessageError('Tu sesión expiró. Vuelve a entrar para subir la foto.')
  return uid
}

/** Borra un objeto de la carpeta propia. Best effort: nunca lanza. */
async function removeObject(uid: string, path: string | null): Promise<void> {
  if (!path || !isOwnCoverPath(uid, path)) return
  forgetCoverUrl(path)
  await supabase.storage
    .from(COVER_BUCKET)
    .remove([path])
    .catch(() => undefined)
}

/**
 * Sube (o reemplaza) la portada de la meta: re-codifica, sube a
 * `{uid}/{goalId}-{ts}.{ext}`, guarda la ruta en la meta y borra la anterior.
 * Si guardar en la meta falla, borra lo recién subido (no deja huérfanos).
 */
export async function uploadGoalCover(goal: Readonly<Goal>, file: File): Promise<Goal> {
  const { blob, mime } = await reencodeCover(file)
  const uid = await sessionUid()
  const path = coverPath(uid, goal.id, Date.now(), mime)
  const uploaded = await supabase.storage
    .from(COVER_BUCKET)
    .upload(path, blob, { upsert: false, contentType: mime, cacheControl: '3600' })
  if (uploaded.error) throw new Error(uploaded.error.message)
  let updated: Goal
  try {
    updated = await setGoalCoverPath(goal.id, path)
  } catch (e) {
    await removeObject(uid, path)
    throw e
  }
  await removeObject(uid, goal.coverPath)
  return updated
}

/** Quita la portada: la meta queda sin foto (y fuera de la tarjeta) y se borra el objeto. */
export async function removeGoalCover(goal: Readonly<Goal>): Promise<Goal> {
  const updated = await setGoalCoverPath(goal.id, null)
  const uid = await sessionUid().catch(() => '')
  await removeObject(uid, goal.coverPath)
  return updated
}

/** Al eliminar la meta: intenta borrar su foto. No bloquea ni lanza. */
export async function discardGoalCover(coverPathToDrop: string | null): Promise<void> {
  if (!coverPathToDrop) return
  const uid = await sessionUid().catch(() => '')
  await removeObject(uid, coverPathToDrop)
}

/* ===== URL firmada (1 h) con caché en memoria =============================== */

/** Se renueva cuando le quedan menos de 5 minutos. */
const RENEW_MARGIN_MS = 5 * 60 * 1000
const urlCache = new Map<string, { url: Promise<string>; expiresAt: number }>()

function forgetCoverUrl(path: string): void {
  urlCache.delete(path)
}

/**
 * URL firmada de la portada (nunca pública). Se cachea en memoria con su
 * vencimiento y se comparte la misma promesa entre pedidos simultáneos.
 */
export function coverUrl(path: string): Promise<string> {
  const now = Date.now()
  const hit = urlCache.get(path)
  if (hit && hit.expiresAt - RENEW_MARGIN_MS > now) return hit.url
  const url = supabase.storage
    .from(COVER_BUCKET)
    .createSignedUrl(path, COVER_URL_TTL_S)
    .then(({ data, error }) => {
      if (error || !data) throw new Error(error?.message ?? 'Sin URL firmada')
      return data.signedUrl
    })
  urlCache.set(path, { url, expiresAt: now + COVER_URL_TTL_S * 1000 })
  url.catch(() => forgetCoverUrl(path))
  return url
}
