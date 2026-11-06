/**
 * Pantallas a capturar (espejo de las rutas de src/App.tsx). `path` es el
 * patrón de App.tsx (lo que acepta --routes); `url` la ruta concreta.
 */
import { GOAL_IDS, HABIT_IDS, type Tables, todaySessionId } from './fixtures/data'
import { WIZARD_PLAN } from './fixtures/ai'
import { dayOffset } from './fixtures/dates'

export interface ShotRoute {
  slug: string
  path: string
  url: (tables: Tables) => string
  /** Sin sesión: pantalla de login. */
  loggedOut?: boolean
  /** Perfil sin onboarding terminado. */
  notOnboarded?: boolean
  /** Borrador del wizard a sembrar en sessionStorage. */
  wizardDraft?: Record<string, unknown>
}

const fixed = (url: string) => () => url

/** Borrador del paso 4 ("Arma tu camino", step=3) con horario, 2 etapas y plan del coach. */
const CAMINO_DRAFT = {
  step: 3,
  title: 'Correr mis primeros 10K',
  templateKey: 'salud_fisico',
  why: 'Quiero sentirme con energía y demostrarme que puedo terminar algo difícil.',
  targetDate: '',
  area: 'salud',
  criteria: 'Terminar una carrera de 10 km sin caminar.',
  blocks: [
    { weekday: 0, targetKind: 'time', targetValue: 30, unit: null, startTime: '06:30' },
    { weekday: 2, targetKind: 'time', targetValue: 30, unit: null, startTime: '06:30' },
    { weekday: 5, targetKind: 'time', targetValue: 45, unit: null, startTime: '08:00' },
  ],
  milestones: [
    { title: 'Correr 3 km seguidos', position: 0, targetDate: null, done: false },
    { title: 'Completar la carrera de 10K', position: 1, targetDate: null, done: false },
  ],
  aiPlan: WIZARD_PLAN,
  aiAnswers: [{ question: '¿Cuánto corres hoy sin parar?', answer: 'Unos 2 km' }],
  chat: [],
}

/** Paso "¿Qué tipo de meta es?" recién abierto: sugerencia por palabras, aún sin la IA. */
const TIPO_DRAFT = {
  step: 1,
  title: 'Lanzar mi app de metas y conseguir 100 usuarios',
  templateKey: 'crear_publicar',
  why: '',
  targetDate: '',
  area: 'creatividad',
  criteria: '',
  blocks: [],
  milestones: [],
  aiPlan: null,
  aiAnswers: null,
  chat: [],
  typePicked: false,
  typeSuggestion: { key: 'crear_publicar', reason: '', alternatives: [], source: 'keywords' },
}

export const ROUTES: ShotRoute[] = [
  { slug: 'auth', path: '/auth', url: fixed('/'), loggedOut: true },
  { slug: 'onboarding', path: '/onboarding', url: fixed('/onboarding'), notOnboarded: true },
  { slug: 'hoy', path: '/', url: fixed('/') },
  { slug: 'metas', path: '/metas', url: fixed('/metas') },
  { slug: 'meta-detalle', path: '/metas/:goalId', url: fixed(`/metas/${GOAL_IDS.salud}`) },
  { slug: 'wizard-paso1', path: '/meta/nueva', url: fixed('/meta/nueva') },
  { slug: 'wizard-tipo', path: '/meta/nueva#tipo', url: fixed('/meta/nueva'), wizardDraft: TIPO_DRAFT },
  { slug: 'wizard-camino', path: '/meta/nueva#camino', url: fixed('/meta/nueva'), wizardDraft: CAMINO_DRAFT },
  { slug: 'meta-creada', path: '/meta/creada/:goalId', url: fixed(`/meta/creada/${GOAL_IDS.salud}`) },
  { slug: 'ideas', path: '/ideas', url: fixed('/ideas') },
  { slug: 'sesion', path: '/sesion/:sessionId', url: (t) => `/sesion/${todaySessionId(t)}` },
  { slug: 'revision', path: '/revision', url: fixed('/revision') },
  { slug: 'habitos', path: '/habitos', url: fixed('/habitos') },
  { slug: 'habito-detalle', path: '/habitos/:habitId', url: fixed(`/habitos/${HABIT_IDS.agua}`) },
  { slug: 'calendario', path: '/calendario', url: fixed('/calendario') },
  // Un día pasado: la agenda avisa que se mira lo que ya pasó.
  { slug: 'calendario-pasado', path: '/calendario?d=ayer', url: () => `/calendario?d=${dayOffset(-1)}` },
  { slug: 'progreso', path: '/progreso', url: fixed('/progreso') },
  { slug: 'aprender', path: '/aprender', url: fixed('/aprender') },
  { slug: 'notas', path: '/notas', url: fixed('/notas') },
  { slug: 'notas-metas', path: '/notas?vista=goals', url: fixed('/notas?vista=goals') },
  { slug: 'perfil', path: '/perfil', url: fixed('/perfil') },
]

/**
 * Filtro de --routes: acepta el patrón de App.tsx (/metas/:goalId), la ruta
 * concreta del patrón (/metas) o el slug (meta-detalle). Coincidencia exacta.
 */
export function selectRoutes(filter: string | undefined): ShotRoute[] {
  const wanted = (filter ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  if (wanted.length === 0) return ROUTES
  return ROUTES.filter((r) => wanted.some((w) => w === r.path || w === r.slug || w === r.path.split('#')[0]))
}

export const WIDTHS = [390, 768, 1280] as const
export const THEMES = ['claro', 'oscuro'] as const
