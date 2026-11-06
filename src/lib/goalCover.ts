/**
 * Reglas puras de la foto de portada de una meta (spec 2026-11-02-color-y-portada).
 * Sin DOM ni red: se prueban en vitest. La subida vive en services/goalCovers.ts.
 */

import { UserMessageError } from '@/lib/errors'

/** Bucket privado de Supabase Storage (migración 0019). */
export const COVER_BUCKET = 'goal-covers'
/** Lado mayor de la foto ya reducida. */
export const COVER_MAX_PX = 1600
/** Tamaño máximo del archivo que elige la persona (antes de reducirlo). */
export const COVER_MAX_INPUT_BYTES = 10 * 1024 * 1024
/** Tamaño máximo de lo que se sube (lo repite `file_size_limit` del bucket). */
export const COVER_MAX_UPLOAD_BYTES = 1.5 * 1024 * 1024
/** Vida de la URL firmada, en segundos (1 h). */
export const COVER_URL_TTL_S = 3600

/** Formatos que se suben. El bucket solo admite estos (`allowed_mime_types`). */
export type CoverMime = 'image/webp' | 'image/jpeg'

const EXT: Record<CoverMime, string> = { 'image/webp': 'webp', 'image/jpeg': 'jpg' }

/** uid y id de meta: solo letras, dígitos y guiones (nada de "/", "." ni "..") */
const SAFE_SEGMENT = /^[A-Za-z0-9-]{1,64}$/

/**
 * Dimensiones tras reducir para que el lado mayor no pase de `max`, sin
 * agrandar fotos pequeñas y conservando la proporción (mínimo 1 px por lado).
 */
export function coverDimensions(
  width: number,
  height: number,
  max: number = COVER_MAX_PX,
): { width: number; height: number } {
  // NaN o infinito (imagen que no se pudo leer) cuentan como inválidos.
  const valid = (n: number) => Number.isFinite(n) && n > 0
  if (!valid(width) || !valid(height)) throw new UserMessageError('No pudimos leer esa imagen. Prueba con otra foto.')
  const scale = Math.min(1, max / Math.max(width, height))
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  }
}

/**
 * Ruta del objeto: `{uid}/{goalId}-{timestamp}.{ext}`. El primer segmento es el
 * uid de la SESIÓN (lo exige la política del bucket); el nombre nunca sale de
 * datos que escribe la persona (ni el nombre del archivo).
 */
export function coverPath(uid: string, goalId: string, timestamp: number, mime: CoverMime = 'image/webp'): string {
  if (!SAFE_SEGMENT.test(uid)) throw new UserMessageError('Sesión inválida para subir la foto.')
  if (!SAFE_SEGMENT.test(goalId)) throw new UserMessageError('Meta inválida para subir la foto.')
  if (!Number.isSafeInteger(timestamp) || timestamp < 0) throw new UserMessageError('Marca de tiempo inválida.')
  return `${uid}/${goalId}-${timestamp}.${EXT[mime]}`
}

/** ¿La ruta pertenece a la carpeta de este usuario? (antes de borrar algo). */
export function isOwnCoverPath(uid: string, path: string): boolean {
  return SAFE_SEGMENT.test(uid) && path.startsWith(`${uid}/`) && !path.includes('..')
}

/**
 * Validación previa del archivo elegido (solo para dar un mensaje claro: el
 * tipo real lo decide el navegador al decodificarlo y el bucket al recibirlo).
 * Devuelve el mensaje de error o null si se puede intentar.
 */
export function coverInputError(file: Readonly<{ type: string; size: number }>): string | null {
  if (file.type !== '' && !file.type.startsWith('image/')) return 'El archivo debe ser una imagen (JPG, PNG, WebP o HEIC).'
  if (file.size > COVER_MAX_INPUT_BYTES) return 'La foto pesa más de 10 MB. Elige una más liviana.'
  return null
}
