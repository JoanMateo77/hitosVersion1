import type { NicheId } from '@/lib/types'

export interface Niche {
  id: NicheId
  label: string
  emoji: string
  /** Frase corta para mostrar bajo el nicho en el onboarding. */
  blurb: string
}

/** Catálogo de nichos. El orden es el que se muestra en el selector del onboarding. */
export const NICHES: Niche[] = [
  { id: 'salud', label: 'Salud y cuerpo', emoji: '💪', blurb: 'Energía, peso, ejercicio, hábitos físicos.' },
  { id: 'finanzas', label: 'Finanzas', emoji: '💰', blurb: 'Ahorrar, ordenar gastos, salir de deudas.' },
  { id: 'carrera', label: 'Carrera y trabajo', emoji: '🚀', blurb: 'Empleo, cambio de rumbo, crecer profesionalmente.' },
  { id: 'aprendizaje', label: 'Aprendizaje', emoji: '📚', blurb: 'Idiomas, código, un oficio, estudiar.' },
  { id: 'relaciones', label: 'Relaciones', emoji: '🤝', blurb: 'Familia, pareja, amistades, vínculos.' },
  { id: 'creatividad', label: 'Crear y publicar', emoji: '🎨', blurb: 'Un libro, canal, portafolio, proyecto propio.' },
  { id: 'bienestar', label: 'Bienestar', emoji: '🌱', blurb: 'Dormir mejor, leer, meditar, bajar el estrés.' },
  { id: 'otra', label: 'Otra', emoji: '🎯', blurb: 'Algo que no entra en las anteriores.' },
]

const NICHE_BY_ID = new Map(NICHES.map((n) => [n.id, n]))

export function getNiche(id: NicheId): Niche {
  // 'otra' siempre existe en el catálogo, así que el fallback es seguro.
  return NICHE_BY_ID.get(id) ?? NICHE_BY_ID.get('otra')!
}

/** Una pregunta de la mini-entrevista para descubrir el nicho ("no sé mi foco"). */
export interface NicheQuestion {
  id: string
  prompt: string
  /** Cada opción suma un punto a un nicho. El de mayor puntaje gana. */
  options: { label: string; niche: NicheId }[]
}

/**
 * Entrevista guiada del onboarding (sección 3.1.1 / 5.1 del documento).
 * Es 100% determinística: no usa IA en runtime, solo cuenta votos por nicho.
 */
export const NICHE_QUESTIONS: NicheQuestion[] = [
  {
    id: 'frustracion',
    prompt: '¿Qué te genera más frustración últimamente?',
    options: [
      { label: 'Mi salud o mi energía', niche: 'salud' },
      { label: 'Mi situación de dinero', niche: 'finanzas' },
      { label: 'Mi trabajo o falta de rumbo', niche: 'carrera' },
      { label: 'Sentir que no aprendo ni crezco', niche: 'aprendizaje' },
      { label: 'Mis relaciones o la soledad', niche: 'relaciones' },
    ],
  },
  {
    id: 'orgullo',
    prompt: '¿Qué te haría sentir más orgulloso/a dentro de 6 meses?',
    options: [
      { label: 'Verme y sentirme mejor físicamente', niche: 'salud' },
      { label: 'Tener mis finanzas ordenadas', niche: 'finanzas' },
      { label: 'Un mejor trabajo o proyecto profesional', niche: 'carrera' },
      { label: 'Dominar una habilidad nueva', niche: 'aprendizaje' },
      { label: 'Haber creado o publicado algo mío', niche: 'creatividad' },
      { label: 'Estar más tranquilo/a y con mejores hábitos', niche: 'bienestar' },
    ],
  },
  {
    id: 'postergado',
    prompt: '¿Qué venís postergando hace tiempo?',
    options: [
      { label: 'Empezar a moverme y cuidarme', niche: 'salud' },
      { label: 'Ordenar mis gastos o ahorrar', niche: 'finanzas' },
      { label: 'Buscar algo mejor en lo laboral', niche: 'carrera' },
      { label: 'Ponerme a estudiar eso que quiero', niche: 'aprendizaje' },
      { label: 'Dedicar tiempo a quienes quiero', niche: 'relaciones' },
      { label: 'Arrancar ese proyecto creativo', niche: 'creatividad' },
    ],
  },
]

/**
 * Determina el nicho principal a partir de las respuestas de la entrevista.
 * Gana el nicho más votado; ante empate, el primero en aparecer (orden de
 * respuesta del usuario), lo que prioriza su primera intuición.
 */
export function scoreNiche(answers: NicheId[]): NicheId {
  if (answers.length === 0) return 'otra'
  const tally = new Map<NicheId, number>()
  for (const niche of answers) {
    tally.set(niche, (tally.get(niche) ?? 0) + 1)
  }
  let best: NicheId = answers[0]
  let bestCount = 0
  for (const [niche, count] of tally) {
    if (count > bestCount) {
      best = niche
      bestCount = count
    }
  }
  return best
}
