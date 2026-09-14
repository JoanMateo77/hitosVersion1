export interface Novedad {
  /** Fecha ISO del despliegue; cambiarla es lo que vuelve a mostrar el aviso. */
  id: string
  titulo: string
  items: string[]
}

/** La novedad vigente si el usuario aún no la cerró; null si ya la vio o no hay. */
export function novedadPendiente(lista: Novedad[], vistaId: string | null): Novedad | null {
  const vigente = lista[0]
  if (!vigente) return null
  return vigente.id === vistaId ? null : vigente
}
