import type { Novedad } from '@/domain/novedades'

/**
 * Qué subimos. Antes de cada despliegue agrega una entrada AL PRINCIPIO con la
 * fecha como `id`: si el `id` no cambia, el aviso no vuelve a salir. Una frase
 * por punto, en el lenguaje del usuario (qué puede hacer ahora, no qué archivo
 * tocamos). Máximo cuatro puntos: lo demás no se lee.
 */
export const NOVEDADES: Novedad[] = [
  {
    id: '2026-11-02',
    titulo: 'Más color y un coach que te acompaña paso a paso',
    items: [
      'Cada meta tiene su color en todas las pantallas, y los textos y botones se leen mejor en modo claro y oscuro.',
      'Toca una meta y entras directo a su detalle.',
      'El coach de tu meta te dice en qué etapa estás y cuál es el siguiente paso, sin repetirse.',
      'Cuando le cuentes al coach que ya hiciste algo, puedes registrarlo como avance con un toque.',
    ],
  },
  {
    id: '2026-10-28',
    titulo: 'Metas más flexibles y una pestaña de Notas',
    items: [
      'Puedes tener metas sin agenda, solo para tenerlas presentes, y verlas arriba en Hoy.',
      'Desde la Agenda editas los días y la duración, saltas un día sin romper la racha o sacas una meta de la agenda. También puedes eliminar una meta.',
      'Nueva pestaña Notas: bandeja, fijadas y convertir una nota en meta, etapa o tarea. Crecer sigue en Perfil.',
      'Activa en Perfil un recordatorio diario con tus metas.',
    ],
  },
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
