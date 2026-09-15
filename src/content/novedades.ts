import type { Novedad } from '@/domain/novedades'

/**
 * Qué subimos. Antes de cada despliegue agrega una entrada AL PRINCIPIO con la
 * fecha como `id`: si el `id` no cambia, el aviso no vuelve a salir. Una frase
 * por punto, en el lenguaje del usuario (qué puede hacer ahora, no qué archivo
 * tocamos). Máximo cuatro puntos: lo demás no se lee.
 */
export const NOVEDADES: Novedad[] = [
  {
    id: '2026-09-15',
    titulo: 'Agenda por bloques y una app más limpia',
    items: [
      'La agenda agrupa lo que coincide en la misma hora: toca un bloque para desplegarlo.',
      'Cada hábito ocupa una sola fila y el check marca la siguiente repetición.',
      'Menos texto en todas las pantallas: lo secundario se pliega con "Ver más".',
    ],
  },
]
