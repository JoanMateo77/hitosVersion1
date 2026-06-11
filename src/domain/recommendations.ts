import type { NicheId } from '@/lib/types'

/** Una meta sugerida lista para adoptar: título concreto + plantilla. */
export interface GoalSeed {
  title: string
  templateKey: string
}

/**
 * Recomendación al inicio (documento, sección 5.1): cuando el usuario no sabe
 * qué meta ponerse, sugerimos 2-3 metas CONCRETAS por nicho (no abstractas),
 * basadas en las plantillas. Es determinístico: reglas, no IA en runtime.
 * El usuario adopta la que quiera o las rechaza todas y escribe la suya.
 */
export const NICHE_GOAL_SUGGESTIONS: Record<NicheId, GoalSeed[]> = {
  salud: [
    { title: 'Caminar 30 min, 5 días por semana', templateKey: 'salud_fisico' },
    { title: 'Bajar 4 kg en 3 meses', templateKey: 'salud_fisico' },
    { title: 'Entrenar fuerza 3 veces por semana', templateKey: 'salud_fisico' },
  ],
  finanzas: [
    { title: 'Ahorrar el 10% de mis ingresos cada mes', templateKey: 'finanzas' },
    { title: 'Llevar el registro de todos mis gastos por 1 mes', templateKey: 'finanzas' },
    { title: 'Armar un fondo de emergencia', templateKey: 'finanzas' },
  ],
  carrera: [
    { title: 'Conseguir un trabajo nuevo en 3 meses', templateKey: 'carrera' },
    { title: 'Actualizar mi CV y aplicar a 20 vacantes', templateKey: 'carrera' },
    { title: 'Armar mi portafolio profesional', templateKey: 'crear_publicar' },
  ],
  aprendizaje: [
    { title: 'Llegar a nivel intermedio de inglés', templateKey: 'aprender_habilidad' },
    { title: 'Aprender a programar haciendo un proyecto', templateKey: 'aprender_habilidad' },
    { title: 'Leer 12 libros este año', templateKey: 'bienestar' },
  ],
  relaciones: [
    { title: 'Tener una cena en familia cada semana', templateKey: 'relaciones' },
    { title: 'Retomar contacto con 5 amistades', templateKey: 'relaciones' },
    { title: 'Llamar a alguien que quieres una vez por semana', templateKey: 'relaciones' },
  ],
  creatividad: [
    { title: 'Publicar mi primer proyecto en 60 días', templateKey: 'crear_publicar' },
    { title: 'Escribir 1 artículo por semana durante 2 meses', templateKey: 'crear_publicar' },
    { title: 'Crear y compartir una pieza por semana', templateKey: 'crear_publicar' },
  ],
  bienestar: [
    { title: 'Dormir 7+ horas todas las noches', templateKey: 'bienestar' },
    { title: 'Meditar 10 min cada día', templateKey: 'bienestar' },
    { title: 'Leer 20 min antes de dormir', templateKey: 'bienestar' },
  ],
  otra: [
    { title: 'Definir y arrancar un proyecto personal', templateKey: 'personalizada' },
    { title: 'Construir un hábito nuevo en 30 días', templateKey: 'bienestar' },
    { title: 'Aprender una habilidad que te interese', templateKey: 'aprender_habilidad' },
  ],
}

export function suggestionsForNiche(niche: NicheId): GoalSeed[] {
  return NICHE_GOAL_SUGGESTIONS[niche] ?? NICHE_GOAL_SUGGESTIONS.otra
}
