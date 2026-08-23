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
    { title: 'Correr mis primeros 5 km sin parar', templateKey: 'salud_fisico' },
    { title: 'Entrenar fuerza 3 veces por semana', templateKey: 'salud_fisico' },
    { title: 'Bajar 5 kg en 3 meses de forma sostenible', templateKey: 'salud_fisico' },
    { title: 'Caminar 8.000 pasos al día durante un mes', templateKey: 'salud_fisico' },
    { title: 'Cocinar saludable de lunes a viernes', templateKey: 'salud_fisico' },
  ],
  finanzas: [
    { title: 'Ahorrar el 10% de mis ingresos cada mes', templateKey: 'finanzas' },
    { title: 'Armar un fondo de emergencia de 3 meses de gastos', templateKey: 'finanzas' },
    { title: 'Salir de mi deuda más cara este año', templateKey: 'finanzas' },
    { title: 'Registrar todos mis gastos durante 30 días', templateKey: 'finanzas' },
    { title: 'Generar un ingreso extra este trimestre', templateKey: 'emprender' },
  ],
  carrera: [
    { title: 'Ganarme un ascenso o aumento este año', templateKey: 'crecer_trabajo' },
    { title: 'Destacar en mi trabajo: 3 logros medibles este trimestre', templateKey: 'crecer_trabajo' },
    { title: 'Conseguir un trabajo nuevo en 3 meses', templateKey: 'carrera' },
    { title: 'Lanzar mi negocio y conseguir mi primera venta', templateKey: 'emprender' },
    { title: 'Aprender a hablar en público con seguridad', templateKey: 'crecer_trabajo' },
  ],
  aprendizaje: [
    { title: 'Llegar a nivel conversacional de inglés', templateKey: 'aprender_habilidad' },
    { title: 'Aprender a programar haciendo un proyecto real', templateKey: 'aprender_habilidad' },
    { title: 'Conseguir una certificación de mi área este año', templateKey: 'academico' },
    { title: 'Leer 12 libros este año', templateKey: 'bienestar' },
    { title: 'Aprender a tocar mis primeras 5 canciones', templateKey: 'aprender_habilidad' },
  ],
  relaciones: [
    { title: 'Tener una cena en familia cada semana', templateKey: 'relaciones' },
    { title: 'Retomar contacto con 5 amistades que extraño', templateKey: 'relaciones' },
    { title: 'Una cita de pareja a la semana, sin pantallas', templateKey: 'relaciones' },
    { title: 'Llamar a mis padres o abuelos cada semana', templateKey: 'relaciones' },
    { title: 'Conocer gente nueva: un plan social al mes', templateKey: 'relaciones' },
  ],
  creatividad: [
    { title: 'Publicar mi primer proyecto en 60 días', templateKey: 'crear_publicar' },
    { title: 'Escribir y publicar 1 artículo por semana', templateKey: 'crear_publicar' },
    { title: 'Grabar y subir mis primeros 10 videos', templateKey: 'crear_publicar' },
    { title: 'Terminar el borrador de mi libro este año', templateKey: 'crear_publicar' },
    { title: 'Vender mi primera pieza o servicio creativo', templateKey: 'emprender' },
  ],
  bienestar: [
    { title: 'Dormir 7+ horas todas las noches', templateKey: 'bienestar' },
    { title: 'Meditar 10 min cada día durante 30 días', templateKey: 'bienestar' },
    { title: 'Reducir redes sociales a 30 min al día', templateKey: 'bienestar' },
    { title: 'Escribir un diario 5 min cada noche', templateKey: 'bienestar' },
    { title: 'Un día a la semana 100% para desconectar', templateKey: 'bienestar' },
  ],
  otra: [
    { title: 'Ganarme un ascenso o aumento este año', templateKey: 'crecer_trabajo' },
    { title: 'Correr mis primeros 5 km sin parar', templateKey: 'salud_fisico' },
    { title: 'Armar un fondo de emergencia de 3 meses', templateKey: 'finanzas' },
    { title: 'Llegar a nivel conversacional de inglés', templateKey: 'aprender_habilidad' },
    { title: 'Definir y arrancar un proyecto personal', templateKey: 'personalizada' },
  ],
}

export function suggestionsForNiche(niche: NicheId): GoalSeed[] {
  return NICHE_GOAL_SUGGESTIONS[niche] ?? NICHE_GOAL_SUGGESTIONS.otra
}
