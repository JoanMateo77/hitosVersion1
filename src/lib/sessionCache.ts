/**
 * Cache en memoria por sesión: vive mientras la pestaña esté abierta; una recarga
 * completa lo vacía. Guarda instantáneas de datos de pantalla para pintarlas al
 * instante al volver, sin skeleton (ver useCachedData).
 *
 * Las claves incluyen el userId (p. ej. `goals:{userId}`), así que nunca se mezclan
 * datos entre cuentas. Además se vacía al cerrar sesión (ver services/auth.ts).
 */
const store = new Map<string, unknown>()

export const sessionCache = {
  get<T>(key: string): T | undefined {
    return store.get(key) as T | undefined
  },
  set<T>(key: string, value: T): void {
    store.set(key, value)
  },
  has(key: string): boolean {
    return store.has(key)
  },
  clear(): void {
    store.clear()
  },
}
