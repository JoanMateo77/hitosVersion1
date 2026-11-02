/**
 * Tras un deploy, una pestaña abierta (o la PWA) todavía pide los módulos y CSS
 * con el hash viejo, que ya no existen. Se arregla recargando, una vez.
 */

const RELOADED_AT_KEY = 'logralo-auto-reload-at'
/** Si ya recargamos hace menos de esto, el problema no es de versión vieja: no insistimos. */
const RELOAD_COOLDOWN_MS = 30_000

/** ¿El error es de un chunk (JS o CSS) de una versión anterior? */
export function isStaleChunkError(error: { name?: string; message?: string }): boolean {
  return /dynamically imported module|module script failed|ChunkLoadError|Loading chunk|error loading|Unable to preload CSS/i.test(
    `${error.name ?? ''} ${error.message ?? ''}`,
  )
}

/**
 * Recarga la página salvo que ya lo hayamos hecho hace poco (evita bucles si
 * el fallo persiste). Devuelve si recargó. Sin sessionStorage no recarga.
 */
export function reloadOnceForStaleChunk(now = Date.now()): boolean {
  try {
    const last = Number(sessionStorage.getItem(RELOADED_AT_KEY))
    if (Number.isFinite(last) && last > 0 && now - last < RELOAD_COOLDOWN_MS) return false
    sessionStorage.setItem(RELOADED_AT_KEY, String(now))
  } catch {
    return false
  }
  window.location.reload()
  return true
}
