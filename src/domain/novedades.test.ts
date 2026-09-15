import { describe, expect, it } from 'vitest'
import { novedadPendiente, type Novedad } from '@/domain/novedades'

const lista: Novedad[] = [
  { id: '2026-09-15', titulo: 'Agenda por bloques', items: ['Bloques desplegables'] },
  { id: '2026-08-01', titulo: 'Hábitos', items: ['Repeticiones por día'] },
]

describe('novedadPendiente', () => {
  it('sin novedades no hay aviso', () => {
    expect(novedadPendiente([], null)).toBeNull()
  })
  it('la más reciente ya vista no se repite', () => {
    expect(novedadPendiente(lista, '2026-09-15')).toBeNull()
  })
  it('una versión nueva vuelve a avisar aunque se haya visto la anterior', () => {
    expect(novedadPendiente(lista, '2026-08-01')?.id).toBe('2026-09-15')
  })
  it('sin registro previo se muestra la vigente', () => {
    expect(novedadPendiente(lista, null)?.id).toBe('2026-09-15')
  })
})
