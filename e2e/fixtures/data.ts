/**
 * Dataset ficticio y coherente de UN usuario para las capturas. Las columnas
 * son las de la BD (snake_case), tal como las mapean los servicios de src/services.
 * Todo se calcula relativo a hoy en cada corrida.
 */
import { addMinutes, dayOffset, stamp, weekdayMon0 } from './dates'

export type Row = Record<string, unknown>
export type Tables = Record<string, Row[]>

export const USER = {
  id: '00000000-0000-4000-8000-00000000a001',
  email: 'laura.gomez@ejemplo.test',
  name: 'Laura Gómez',
}

/** UUID determinista legible: prefijo por tabla + número. */
function uid(prefix: string, n: number): string {
  return `00000000-0000-4000-${prefix}-${String(n).padStart(12, '0')}`
}

export const GOAL_IDS = {
  salud: uid('8001', 1),
  finanzas: uid('8001', 2),
  aprendizaje: uid('8001', 3),
  relaciones: uid('8001', 4),
  bienestar: uid('8001', 5),
  creatividad: uid('8001', 6),
} as const

export const HABIT_IDS = {
  agua: uid('8002', 1),
  lectura: uid('8002', 2),
  estirar: uid('8002', 3),
  pantallas: uid('8002', 4),
} as const

type GoalKey = keyof typeof GOAL_IDS

interface GoalSeed {
  key: GoalKey
  title: string
  why: string
  area: string
  template: string
  criteria: string
  targetInDays: number
  createdDaysAgo: number
  milestones: { title: string; done: boolean }[]
  /** Color propio (clave de la paleta) distinto del área; sin él, el del área. */
  color?: string
  /** Portada en la cabecera y también en la tarjeta (imagen local servida por el mock). */
  coverOnCard?: boolean
  /** Bloques: weekdays (lun=0), minutos, hora. */
  blocks: { weekdays: number[]; minutes: number; time: string; kind?: 'time' | 'count'; unit?: string }[]
}

const GOALS: GoalSeed[] = [
  {
    key: 'salud',
    title: 'Correr mis primeros 10K',
    why: 'Quiero sentirme con energía y demostrarme que puedo terminar algo difícil.',
    area: 'salud',
    template: 'salud_fisico',
    criteria: 'Terminar una carrera de 10 km sin caminar.',
    coverOnCard: true,
    targetInDays: 70,
    createdDaysAgo: 40,
    milestones: [
      { title: 'Correr 3 km seguidos', done: true },
      { title: 'Correr 5 km en menos de 35 minutos', done: true },
      { title: 'Inscribirme en una carrera de 10K', done: false },
      { title: 'Correr 8 km en un entrenamiento largo', done: false },
      { title: 'Completar la carrera de 10K', done: false },
    ],
    blocks: [{ weekdays: [0, 2, 4], minutes: 30, time: '06:30' }],
  },
  {
    key: 'finanzas',
    title: 'Comprar una moto',
    why: 'Ahorrar dos horas diarias de transporte y ganar independencia.',
    area: 'finanzas',
    // Petróleo en vez del amarillo de Finanzas: prueba el color propio.
    color: 'carrera',
    template: 'finanzas',
    criteria: 'Tener la moto pagada de contado, sin deudas.',
    targetInDays: 210,
    createdDaysAgo: 55,
    milestones: [
      { title: 'Definir el modelo y el precio total', done: true },
      { title: 'Abrir una cuenta de ahorro aparte', done: true },
      { title: 'Ahorrar el 25 %', done: false },
      { title: 'Ahorrar el 50 %', done: false },
      { title: 'Ahorrar el 100 % y comprarla', done: false },
    ],
    blocks: [{ weekdays: [6], minutes: 15, time: '20:00' }],
  },
  {
    key: 'aprendizaje',
    title: 'Inglés B2 para el trabajo',
    why: 'Poder liderar reuniones con clientes de afuera sin depender de nadie.',
    area: 'aprendizaje',
    template: 'aprender_habilidad',
    criteria: 'Aprobar un examen B2 y sostener una reunión de 30 minutos en inglés.',
    targetInDays: 150,
    createdDaysAgo: 35,
    milestones: [
      { title: 'Hacer una prueba de nivel', done: true },
      { title: 'Terminar el módulo de gramática intermedia', done: false },
      { title: 'Ver una serie completa sin subtítulos', done: false },
      { title: 'Presentar el examen B2', done: false },
    ],
    blocks: [
      { weekdays: [1, 3], minutes: 40, time: '19:00' },
      { weekdays: [5], minutes: 20, time: '10:00', kind: 'count', unit: 'páginas' },
    ],
  },
  {
    key: 'relaciones',
    title: 'Llamar más a mi familia',
    why: 'Mis papás están lejos y no quiero que la distancia nos aleje.',
    area: 'relaciones',
    template: 'relaciones',
    criteria: 'Una llamada larga por semana durante tres meses.',
    targetInDays: 90,
    createdDaysAgo: 20,
    milestones: [
      { title: 'Acordar un día fijo para llamar', done: true },
      { title: 'Cuatro semanas seguidas sin faltar', done: false },
      { title: 'Organizar una visita en persona', done: false },
    ],
    blocks: [{ weekdays: [2, 6], minutes: 20, time: '19:30' }],
  },
  {
    key: 'bienestar',
    title: 'Meditar 10 minutos al día',
    why: 'Bajar la ansiedad y dormir mejor.',
    area: 'bienestar',
    template: 'bienestar',
    criteria: 'Meditar 60 días de los próximos 70.',
    targetInDays: 50,
    createdDaysAgo: 28,
    milestones: [
      { title: 'Elegir una app y un rincón tranquilo', done: true },
      { title: 'Siete días seguidos', done: true },
      { title: 'Treinta días con al menos 25 cumplidos', done: false },
      { title: 'Sesenta días cumplidos', done: false },
    ],
    blocks: [{ weekdays: [0, 1, 2, 3, 4, 5, 6], minutes: 10, time: '07:00' }],
  },
  {
    key: 'creatividad',
    title: 'Lanzar mi app de metas',
    why: 'Quiero construir algo propio que ayude a otras personas.',
    area: 'creatividad',
    template: 'emprender',
    criteria: 'Tener 50 personas usando la app cada semana.',
    targetInDays: 120,
    createdDaysAgo: 45,
    milestones: [
      { title: 'Validar la idea con 10 personas', done: true },
      { title: 'Diseñar las pantallas principales', done: true },
      { title: 'Construir la primera versión', done: true },
      { title: 'Probarla con 5 amigos', done: false },
      { title: 'Publicar la landing', done: false },
      { title: 'Conseguir los primeros 50 usuarios', done: false },
    ],
    blocks: [{ weekdays: [0, 3], minutes: 60, time: '21:00' }],
  },
]

const ACCOMPLISHMENTS = [
  'Hice todo el recorrido sin parar.',
  'Repasé vocabulario de reuniones.',
  'Terminé la pantalla de inicio.',
  'Me costó concentrarme, pero cumplí.',
]

/** Numeración global de filas generadas (estable entre corridas). */
interface Counters {
  milestone: number
  block: number
  session: number
}

type Block = GoalSeed['blocks'][number]

function buildProfiles(u: string, onboarded: boolean): Row[] {
  return [
    {
      id: u,
      focus_mode: 'multi',
      primary_niche: 'salud',
      onboarded_at: onboarded ? stamp(-60, '09:00') : null,
      preferred_moment: 'morning',
      default_session_minutes: 25,
      priority_goal_id: GOAL_IDS.salud,
      avatar_url: null,
      daily_digest_time: '07:30',
      tz: 'America/Bogota',
      created_at: stamp(-60, '08:55'),
    },
  ]
}

function goalRow(u: string, g: GoalSeed): Row {
  return {
    id: GOAL_IDS[g.key],
    user_id: u,
    title: g.title,
    why: g.why,
    target_date: dayOffset(g.targetInDays),
    area: g.area,
    success_criteria: g.criteria,
    template_key: g.template,
    last_reviewed_at: stamp(-8, '18:00'),
    status: 'active',
    created_at: stamp(-g.createdDaysAgo, '10:00'),
    completed_at: null,
    ai_plan: null,
    ai_answers: [],
    color: g.color ?? null,
    cover_path: g.coverOnCard === undefined ? null : coverPathFor(u, g.key),
    cover_on_card: g.coverOnCard ?? false,
  }
}

/** Ruta de la portada en el bucket (el mock sirve e2e/fixtures/cover.jpg para cualquiera). */
function coverPathFor(u: string, key: GoalKey): string {
  return `${u}/${GOAL_IDS[key]}-1730000000000.jpg`
}

function milestoneRows(u: string, g: GoalSeed, counters: Counters): Row[] {
  let doneCount = 0
  return g.milestones.map((m, position) => {
    const doneAt = m.done ? stamp(-g.createdDaysAgo + 7 * ++doneCount, '20:00') : null
    const targetDate = m.done ? null : dayOffset(Math.round((g.targetInDays / g.milestones.length) * (position + 1)))
    return {
      id: uid('8003', ++counters.milestone),
      goal_id: GOAL_IDS[g.key],
      user_id: u,
      title: m.title,
      position,
      target_date: targetDate,
      done_at: doneAt,
      created_at: stamp(-g.createdDaysAgo, '10:00'),
    }
  })
}

/**
 * Patrón estable: la mayoría cumplidas, algunas parciales o perdidas, y los
 * últimos 4 días siempre cumplidos (racha viva). Hoy depende de la hora del bloque.
 */
function sessionStatus(d: number, n: number, time: string): string {
  if (d === 0) return time < '09:00' ? 'done' : 'pending'
  if (d < -4 && n % 7 === 3) return 'missed'
  if (d < -4 && n % 9 === 5) return 'partial'
  return 'done'
}

function sessionActual(status: string, target: number): number | null {
  if (status === 'done') return target
  if (status === 'partial') return Math.round(target / 2)
  return null
}

function sessionRow(u: string, goalId: string, blockId: string, b: Block, d: number, n: number): Row {
  const kind = b.kind ?? 'time'
  const status = sessionStatus(d, n, b.time)
  const target = b.minutes
  const actual = sessionActual(status, target)
  const started = status === 'done' || status === 'partial'
  const minutesSpent = kind === 'time' ? (actual ?? 0) : 25
  return {
    id: uid('8005', n),
    goal_id: goalId,
    user_id: u,
    schedule_id: blockId,
    session_date: dayOffset(d),
    target_kind: kind,
    target_value: target,
    unit: kind === 'count' ? (b.unit ?? null) : null,
    planned_time: b.time,
    started_at: started ? stamp(d, b.time) : null,
    ended_at: started ? stamp(d, addMinutes(b.time, minutesSpent)) : null,
    actual_value: actual,
    status,
    paused_at: null,
    paused_total_seconds: 0,
    accomplishment: started && n % 4 === 0 ? ACCOMPLISHMENTS[n % ACCOMPLISHMENTS.length] : null,
    created_at: stamp(d, '00:05'),
  }
}

/** Un bloque de agenda por día de la semana, con sus sesiones de las últimas dos semanas + hoy. */
function scheduleAndSessions(
  u: string,
  g: GoalSeed,
  counters: Counters,
): { schedule: Row[]; sessions: Row[] } {
  const goalId = GOAL_IDS[g.key]
  const schedule: Row[] = []
  const sessions: Row[] = []
  for (const b of g.blocks) {
    for (const weekday of b.weekdays) {
      const blockId = uid('8004', ++counters.block)
      const kind = b.kind ?? 'time'
      schedule.push({
        id: blockId,
        goal_id: goalId,
        user_id: u,
        weekday,
        target_kind: kind,
        target_value: b.minutes,
        unit: kind === 'count' ? (b.unit ?? null) : null,
        start_time: b.time,
        created_at: stamp(-g.createdDaysAgo, '10:05'),
      })
      for (let d = -14; d <= 0; d++) {
        if (weekdayMon0(d) !== weekday || -d > g.createdDaysAgo) continue
        sessions.push(sessionRow(u, goalId, blockId, b, d, ++counters.session))
      }
    }
  }
  return { schedule, sessions }
}

function buildGoalTables(u: string): Pick<Tables, 'goals' | 'milestones' | 'goal_schedule' | 'sessions'> {
  const counters: Counters = { milestone: 0, block: 0, session: 0 }
  const out = { goals: [] as Row[], milestones: [] as Row[], goal_schedule: [] as Row[], sessions: [] as Row[] }
  for (const g of GOALS) {
    out.goals.push(goalRow(u, g))
    out.milestones.push(...milestoneRows(u, g, counters))
    const { schedule, sessions } = scheduleAndSessions(u, g, counters)
    out.goal_schedule.push(...schedule)
    out.sessions.push(...sessions)
  }
  return out
}

/** Agua: 4 vasos casi siempre; cada 5 días, 3; hoy, 2. */
function glassesOfWater(d: number): number {
  if (d === 0) return 2
  if (d % 5 === 0) return 3
  return 4
}

const WATER_TIMES = ['08:00', '11:00', '15:00', '19:00']

function buildHabitChecks(u: string): Row[] {
  const check = (habitId: string, d: number, slot: number, time: string): Row => ({
    user_id: u,
    habit_id: habitId,
    date: dayOffset(d),
    slot,
    created_at: stamp(d, time),
  })
  const habit_checks: Row[] = []
  for (let d = -14; d <= 0; d++) {
    const wd = weekdayMon0(d)
    for (let slot = 0; slot < glassesOfWater(d); slot++) {
      habit_checks.push(check(HABIT_IDS.agua, d, slot, WATER_TIMES[slot]))
    }
    if (d < 0 && d % 4 !== 0) habit_checks.push(check(HABIT_IDS.lectura, d, 0, '21:40'))
    if (wd <= 4 && d % 6 !== 0) habit_checks.push(check(HABIT_IDS.estirar, d, 0, '06:20'))
    if (d < 0 && d % 3 !== 0) habit_checks.push(check(HABIT_IDS.pantallas, d, 0, '22:30'))
  }
  return habit_checks
}

function buildTasks(u: string): Row[] {
  return [
    { title: 'Comprar tenis para correr', goal_id: GOAL_IDS.salud, source: 'goal', status: 'done' },
    { title: 'Revisar el extracto del ahorro', goal_id: GOAL_IDS.finanzas, source: 'goal', status: 'pending' },
    { title: 'Pagar la factura del celular', goal_id: null, source: 'user', status: 'pending' },
  ].map((t, i) => ({
    id: uid('8006', i + 1),
    user_id: u,
    goal_id: t.goal_id,
    title: t.title,
    plan_date: dayOffset(0),
    source: t.source,
    status: t.status,
    created_at: stamp(0, '06:00'),
    done_at: t.status === 'done' ? stamp(0, '06:45') : null,
  }))
}

function buildHabits(u: string): Row[] {
  return [
    {
      id: HABIT_IDS.agua,
      title: 'Tomar agua',
      area: 'salud',
      weekdays: [],
      times: ['08:00', '11:00', '15:00', '19:00'],
      icon: '💧',
      color: 'cyan',
      unit: 'vasos',
      times_per_day: 4,
      goal_id: GOAL_IDS.salud,
    },
    {
      id: HABIT_IDS.lectura,
      title: 'Leer 10 páginas',
      area: 'aprendizaje',
      weekdays: [],
      times: ['21:30'],
      icon: '📚',
      color: 'purple',
      unit: 'páginas',
      times_per_day: 1,
      goal_id: GOAL_IDS.aprendizaje,
    },
    {
      id: HABIT_IDS.estirar,
      title: 'Estirar al despertar',
      area: 'bienestar',
      weekdays: [0, 1, 2, 3, 4],
      times: ['06:15'],
      icon: '🧘',
      color: 'green',
      unit: null,
      times_per_day: 1,
      goal_id: null,
    },
    {
      id: HABIT_IDS.pantallas,
      title: 'Sin pantallas antes de dormir',
      area: 'bienestar',
      weekdays: [],
      times: null,
      icon: '🌙',
      color: 'blue',
      unit: null,
      times_per_day: 1,
      goal_id: GOAL_IDS.bienestar,
    },
  ].map((h, i) => ({
    ...h,
    user_id: u,
    paused_until: null,
    created_at: stamp(-30 + i, '09:00'),
    archived_at: null,
  }))
}

function buildNotes(u: string): Row[] {
  return [
    {
      title: 'Ruta para el domingo',
      body: 'Probar el circuito del parque: dos vueltas son 6 km. Llevar agua.',
      items: null,
      place: 'goal',
      goal_id: GOAL_IDS.salud,
      area: null,
      pinned: true,
    },
    {
      title: 'Frases para reuniones',
      body: '',
      items: [
        { text: 'Could you walk me through…', done: true },
        { text: "Let's circle back on this", done: true },
        { text: 'What would success look like?', done: false },
      ],
      place: 'goal',
      goal_id: GOAL_IDS.aprendizaje,
      area: null,
      pinned: false,
    },
    {
      title: null,
      body: 'Idea: un recordatorio que se adapte a la hora en que de verdad cumplo.',
      items: null,
      place: 'ideas',
      goal_id: null,
      area: null,
      pinned: false,
    },
    {
      title: 'Cosas para preguntarle a mamá',
      body: 'La receta del ajiaco y cómo le fue en el control médico.',
      items: null,
      place: 'area',
      goal_id: null,
      area: 'relaciones',
      pinned: false,
    },
    {
      title: null,
      body: 'Revisar precios de seguros para moto.',
      items: null,
      place: 'inbox',
      goal_id: null,
      area: null,
      pinned: false,
    },
  ].map((n, i) => ({
    ...n,
    id: uid('8007', i + 1),
    user_id: u,
    archived_at: null,
    created_at: stamp(-10 + i * 2, '13:00'),
    updated_at: stamp(-6 + i, '13:00'),
  }))
}

function buildEvents(u: string): Row[] {
  return [
    { title: 'Carrera de 5K del barrio', goal_id: GOAL_IDS.salud, d: 5, start: '07:00', end: '09:00', all_day: false, done: false },
    { title: 'Clase de conversación en inglés', goal_id: GOAL_IDS.aprendizaje, d: 1, start: '18:00', end: '19:00', all_day: false, done: false },
    { title: 'Cumpleaños de mi papá', goal_id: GOAL_IDS.relaciones, d: 3, start: null, end: null, all_day: true, done: false },
    { title: 'Cita con el asesor del banco', goal_id: GOAL_IDS.finanzas, d: -2, start: '11:00', end: '11:30', all_day: false, done: true },
    { title: 'Demo de la app con amigos', goal_id: GOAL_IDS.creatividad, d: 0, start: '17:00', end: '18:00', all_day: false, done: false },
  ].map((e, i) => ({
    id: uid('8008', i + 1),
    user_id: u,
    goal_id: e.goal_id,
    title: e.title,
    notes: null,
    event_date: dayOffset(e.d),
    start_time: e.start,
    end_time: e.end,
    all_day: e.all_day,
    done_at: e.done ? stamp(e.d, '12:00') : null,
    created_at: stamp(-12, '10:00'),
  }))
}

function buildLessonReads(u: string): Row[] {
  return ['una-meta-primero', 'la-unica-cosa', 'empieza-pequeno', 'regla-de-los-2-minutos'].map(
    (lesson_id, i) => ({ user_id: u, lesson_id, created_at: stamp(-20 + i * 3, '21:00') }),
  )
}

function buildCoachMessages(u: string): Row[] {
  return [
    {
      role: 'user',
      body: '¿Me falta algo antes de inscribirme en la carrera?',
      proposal: null,
    },
    {
      role: 'coach',
      body: 'Vas bien: ya corres 5 km. Antes de inscribirte conviene sumar una tirada larga semanal para que el salto a 10 km no te tome por sorpresa.',
      proposal: {
        summary: 'Agregar una etapa de tirada larga antes de la inscripción.',
        changes: [{ kind: 'add', title: 'Hacer una tirada larga de 7 km', afterTitle: 'Correr 5 km en menos de 35 minutos' }],
        status: 'pending',
      },
    },
    {
      role: 'user',
      body: 'Perfecto, la agrego.',
      proposal: null,
    },
  ].map((m, i) => ({
    ...m,
    id: uid('8009', i + 1),
    user_id: u,
    goal_id: GOAL_IDS.salud,
    created_at: stamp(-3, `20:0${i}`),
  }))
}

export function buildFixtures(opts: { onboarded?: boolean } = {}): Tables {
  const u = USER.id
  return {
    profiles: buildProfiles(u, opts.onboarded ?? true),
    ...buildGoalTables(u),
    tasks: buildTasks(u),
    habits: buildHabits(u),
    habit_checks: buildHabitChecks(u),
    habit_skips: [{ user_id: u, habit_id: HABIT_IDS.lectura, date: dayOffset(-4), created_at: stamp(-4, '22:00') }],
    habit_day_overrides: [],
    notes: buildNotes(u),
    events: buildEvents(u),
    lesson_reads: buildLessonReads(u),
    goal_coach_messages: buildCoachMessages(u),
    push_subscriptions: [],
  }
}

/** Primera sesión pendiente de hoy (para /sesion/:id), o la primera de hoy. */
export function todaySessionId(tables: Tables): string {
  const today = dayOffset(0)
  const ofToday = tables.sessions.filter((s) => s.session_date === today)
  const pending = ofToday.find((s) => s.status === 'pending') ?? ofToday[0]
  const id = pending?.id
  return typeof id === 'string' ? id : ''
}
