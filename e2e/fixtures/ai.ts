/**
 * Respuestas enlatadas de POST /api/plan-meta por `action` (formas de
 * src/domain/goalPlan.ts, coachChat.ts y goalType.ts). Nunca se llama a la IA.
 */

const PLAN = {
  schemaVersion: 1,
  summary: 'Subir la distancia poco a poco, con una tirada larga por semana y descanso entre sesiones.',
  weeklyMinutes: 90,
  stages: [
    {
      title: 'Correr 3 km seguidos',
      objective: 'Construir la base aeróbica sin lesionarte.',
      weeks: 3,
      firstActions: ['Alternar 2 min corriendo y 1 caminando', 'Comprar tenis adecuados'],
      successSignal: 'Corres 3 km sin detenerte.',
      insertAfter: 0,
      reason: 'Es el primer escalón realista.',
    },
    {
      title: 'Hacer una tirada larga de 7 km',
      objective: 'Acostumbrar el cuerpo a la distancia.',
      weeks: 4,
      firstActions: ['Sumar 1 km por semana a la tirada larga'],
      successSignal: 'Terminas 7 km a ritmo cómodo.',
      insertAfter: 1,
      reason: 'Falta un paso intermedio antes de la carrera.',
    },
    {
      title: 'Completar la carrera de 10K',
      objective: 'Cruzar la meta.',
      weeks: 2,
      firstActions: ['Inscribirte en una carrera', 'Bajar la carga la última semana'],
      successSignal: 'Terminas los 10 km.',
      insertAfter: 2,
    },
  ],
  notes: ['Tus etapas van en buen orden; solo falta un paso intermedio.'],
}

export const WIZARD_PLAN = PLAN

export function aiResponse(action: string): unknown {
  switch (action) {
    case 'questions':
      return {
        questions: [
          { question: '¿Cuánto corres hoy sin parar?', options: ['Nada todavía', 'Unos 2 km', '5 km o más'] },
          { question: '¿Qué días tienes más tiempo?', options: ['Entre semana', 'Fines de semana', 'Cualquiera'] },
        ],
      }
    case 'plan':
    case 'refine':
      return { plan: PLAN, signals: ['Sueles cumplir mejor por la mañana.'] }
    case 'chat':
      return { reply: 'Buena pregunta. Te sugiero mantener el ritmo actual dos semanas más antes de subir distancia.', proposal: null }
    case 'criteria':
      return {
        options: [
          { text: 'Terminar una carrera oficial de 10 km', why: 'Es verificable y tiene fecha.' },
          { text: 'Correr 10 km en menos de 70 minutos', why: 'Mide ritmo, no solo distancia.' },
          { text: 'Correr 10 km tres veces en un mes', why: 'Mide constancia.' },
        ],
      }
    case 'type':
      return { type: { key: 'emprender', reason: 'Hablas de lanzar un producto propio.', alternatives: ['crear_publicar', 'carrera'] } }
    default:
      return { error: { code: 'unknown_action' } }
  }
}
