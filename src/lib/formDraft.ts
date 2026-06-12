/**
 * Borradores efímeros de formularios (sessionStorage): sobreviven la recarga
 * automática de la PWA sin volverse estado permanente. Mismo espíritu que el
 * borrador del Wizard: tolerante a fallos (Safari privado, JSON corrupto) y
 * el caller valida campo por campo lo que restaura.
 */

export function loadFormDraft<T>(key: string): Partial<T> | null {
  try {
    const raw = sessionStorage.getItem(key)
    if (!raw) return null
    const parsed: unknown = JSON.parse(raw)
    if (parsed == null || typeof parsed !== 'object' || Array.isArray(parsed)) return null
    return parsed as Partial<T>
  } catch {
    return null
  }
}

export function saveFormDraft(key: string, value: Record<string, unknown>): void {
  try {
    sessionStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* sin sessionStorage el borrador dura solo en memoria: aceptable */
  }
}

export function clearFormDraft(key: string): void {
  try {
    sessionStorage.removeItem(key)
  } catch {
    /* ignore */
  }
}
