/**
 * Tipos de dominio de la app.
 *
 * Convención: en la base de datos las columnas son snake_case; en la app
 * trabajamos siempre con estos tipos en camelCase. El mapeo vive en los
 * servicios (src/services), no se filtra a la UI.
 */

/** Áreas de la vida (nichos). Es la taxonomía única que comparten metas y onboarding. */
export type NicheId =
  | 'salud'
  | 'finanzas'
  | 'carrera'
  | 'aprendizaje'
  | 'relaciones'
  | 'creatividad'
  | 'bienestar'
  | 'otra'

/** Modo elegido en el onboarding: una sola meta (enfocado) o varias en paralelo. */
export type FocusMode = 'single' | 'multi'

export type GoalStatus = 'active' | 'paused' | 'done' | 'archived'

/** De dónde salió un ítem del plan del día. */
export type TaskSource = 'user' | 'goal' | 'suggested'

export type TaskStatus = 'pending' | 'done' | 'postponed'

/** Frecuencia con la que una meta pide una acción en el plan diario. */
export type Cadence = 'daily' | 'weekdays' | 'thrice_week' | 'weekly'

/** Momento del día en que al usuario le resulta más fácil cumplir. */
export type PreferredMoment = 'morning' | 'midday' | 'evening'

/** Perfil del usuario (1:1 con auth.users en Supabase). */
export interface Profile {
  id: string
  /** @deprecated El modo Enfoque se elimina en Fase 2; no usar en código nuevo. */
  focusMode: FocusMode
  primaryNiche: NicheId | null
  /** Fecha en que terminó el onboarding; null = todavía no lo completó. */
  onboardedAt: string | null
  /** Defaults capturados en onboarding (alimentan el wizard). */
  preferredMoment: PreferredMoment | null
  defaultSessionMinutes: number | null
  /** Meta prioritaria ⭐ opcional: ordena el día, no oculta nada. */
  priorityGoalId: string | null
  createdAt: string
}

export interface Goal {
  id: string
  userId: string
  /** ¿Qué querés lograr? */
  title: string
  /** ¿Por qué? — ancla emocional que la app recuerda en momentos de fricción. */
  why: string | null
  /** ¿Para cuándo? — ISO date (yyyy-mm-dd) o null si no definió fecha. */
  targetDate: string | null
  /** Área de la vida en la que cae. */
  area: NicheId
  /** ¿Cómo vas a saber que lo lograste? (criterio observable) */
  successCriteria: string | null
  /** Plantilla (Mecanismo F) de la que deriva su estructura y acciones. */
  templateKey: string
  /** Última revisión guiada de esta meta (ISO), o null si nunca se revisó. */
  lastReviewedAt: string | null
  status: GoalStatus
  createdAt: string
  completedAt: string | null
}

/** Un ítem del plan del día. */
export interface Task {
  id: string
  userId: string
  /** Meta de la que deriva, o null si es una tarea propia del usuario. */
  goalId: string | null
  title: string
  /** Día al que pertenece el ítem (yyyy-mm-dd). */
  planDate: string
  source: TaskSource
  status: TaskStatus
  createdAt: string
  doneAt: string | null
}

/** Plantilla pre-armada por tipo de meta (Mecanismo F). */
export interface GoalTemplate {
  key: string
  /** Etiqueta corta que ve el usuario al elegir tipo de meta. */
  label: string
  emoji: string
  /** Área por defecto que sugiere esta plantilla. */
  defaultArea: NicheId
  /** Una línea explicando para qué sirve. */
  description: string
  /** Palabras clave para detectar la plantilla desde el título de la meta. */
  keywords: string[]
  /** Hitos típicos del camino. */
  milestones: string[]
  /** Pool de acciones cortas y concretas para el plan del día. */
  actions: string[]
  /**
   * Pool de acciones de *arranque* para la primera etapa (currentMilestone 0).
   * Opcional: si no está, se usa `actions`. Sirve para que el día 0 proponga
   * "empezar" (anotar tu punto de partida, elegir recurso…) en vez de acciones
   * de régimen.
   */
  kickoffActions?: string[]
  /** Con qué frecuencia esta meta pide una acción. */
  cadence: Cadence
  /** Cada cuántos días se sugiere revisar la meta. */
  reviewEveryDays: number
}

/** Un evento de la agenda/calendario del usuario (Sección 4). */
export interface CalendarEvent {
  id: string
  userId: string
  /** Meta opcional asociada (Sección 4.2). null = evento suelto. */
  goalId: string | null
  title: string
  notes: string | null
  /** Día del evento (yyyy-mm-dd). */
  date: string
  /** Hora de inicio "HH:MM", o null si es de día completo. */
  startTime: string | null
  endTime: string | null
  allDay: boolean
  createdAt: string
}

/** Cómo se mide una sesión: tiempo (minutos) o cantidad (páginas, km…). */
export type TargetKind = 'time' | 'count'

/** Hito propio de UNA meta. Editable; se marca individualmente. */
export interface Milestone {
  id: string
  goalId: string
  userId: string
  title: string
  /** Orden dentro del camino (0-based). */
  position: number
  targetDate: string | null
  /** Cuándo se cumplió; null = pendiente. */
  doneAt: string | null
  createdAt: string
}

/**
 * Un bloque/momento comprometido: "los lunes, 25 min, a las 19:00".
 * Un día puede tener varios bloques. weekday: lunes=0 … domingo=6.
 */
export interface ScheduleBlock {
  id: string
  goalId: string
  userId: string
  weekday: number
  targetKind: TargetKind
  /** Minutos si targetKind='time'; cantidad si 'count'. */
  targetValue: number
  /** Unidad para 'count' ("páginas", "km"…); null para 'time'. */
  unit: string | null
  /** Hora preferida "HH:MM", o null si todavía no la fijó. */
  startTime: string | null
  createdAt: string
}

export type SessionStatus = 'pending' | 'running' | 'done' | 'partial' | 'missed' | 'unconfirmed'

/** Una sesión de trabajo real sobre una meta, generada desde el compromiso. */
export interface Session {
  id: string
  goalId: string
  userId: string
  /** Bloque que la generó; null = sesión espontánea. */
  scheduleId: string | null
  date: string
  targetKind: TargetKind
  targetValue: number
  unit: string | null
  plannedTime: string | null
  startedAt: string | null
  endedAt: string | null
  /** Minutos (time) o cantidad (count) realmente hechos. */
  actualValue: number | null
  status: SessionStatus
  /** Pausa del cronómetro: cuándo se pausó y cuánto acumula en pausas. */
  pausedAt: string | null
  pausedTotalSeconds: number
  /** Diario de avances: qué lograste en esta sesión (opcional). */
  accomplishment: string | null
  createdAt: string
}

/* ===== Hábitos diarios (zona nueva 2026-06) ================================ */

/** Rutina de un toque: sin etapas ni cronómetro. Marcar = cumplido hoy. */
export interface Habit {
  id: string
  userId: string
  title: string
  area: NicheId
  /** Días en que aplica (lunes=0 … domingo=6). Vacío = todos los días. */
  weekdays: number[]
  /** Meta a la que suma este hábito (opcional). */
  goalId: string | null
  createdAt: string
  archivedAt: string | null
}

/** Marca diaria de un hábito cumplido. */
export interface HabitCheck {
  habitId: string
  date: string
}

/* ===== Aprender (micro-lecciones de crecimiento) =========================== */

/** Lección de 2 minutos: una idea + cómo aplicarla hoy. */
export interface LearnLesson {
  id: string
  title: string
  /** La idea central, en 2-4 frases claras. */
  idea: string
  /** Cómo aplicarla hoy mismo, concreto. */
  apply: string
  /** Acción sugerida: convertir la lección en un hábito o una meta. */
  cta?: { kind: 'habit' | 'goal'; title: string; area: NicheId }
}

/** Colección de lecciones con un hilo conductor. */
export interface LearnCollection {
  id: string
  title: string
  blurb: string
  area: NicheId
  lessons: LearnLesson[]
}
