import type { NicheId } from '@/lib/types'

const AREAS: ReadonlySet<string> = new Set<NicheId>([
  'salud',
  'finanzas',
  'carrera',
  'aprendizaje',
  'relaciones',
  'creatividad',
  'bienestar',
  'otra',
])

/** La columna aún no existe en la base (una migración sin aplicar). */
export function isMissingColumn(error: { code?: string } | null): boolean {
  return error?.code === '42703' || error?.code === 'PGRST204'
}

/** Área guardada en events/tasks (0022), o null si no hay o no es válida. */
export function readArea(value: unknown): NicheId | null {
  return typeof value === 'string' && AREAS.has(value) ? (value as NicheId) : null
}

/** La misma fila sin la columna area (para reintentar sin la migración 0022). */
export function withoutArea<T extends Record<string, unknown>>(row: T): Omit<T, 'area'> {
  const rest: Record<string, unknown> = { ...row }
  delete rest.area
  return rest as Omit<T, 'area'>
}
