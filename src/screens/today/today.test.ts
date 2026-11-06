import { createElement as h, createRef, type ComponentProps } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { Goal, Session, Task } from '@/lib/types'
import type { LaterItem } from '@/domain/today'
import { NextStep } from './TodayHero'
import { TodayVoice } from './TodayVoice'
import { LaterSection, type LaterLookup } from './TodayLater'
import { TodayStats, WeekStrip } from './TodayStats'

/** Partes de Hoy renderizadas a HTML (sin DOM): qué se muestra en cada estado. */

const noop = () => {}

const goal: Goal = {
  id: 'g1',
  userId: 'u',
  title: 'Correr 10K',
  why: null,
  targetDate: null,
  area: 'salud',
  successCriteria: null,
  templateKey: 'general',
  lastReviewedAt: null,
  status: 'active',
  createdAt: '2026-11-01T00:00:00Z',
  completedAt: null,
  color: null,
  coverPath: null,
  coverOnCard: false,
} as Goal

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    goalId: 'g1',
    userId: 'u',
    scheduleId: null,
    date: '2026-11-06',
    targetKind: 'time',
    targetValue: 30,
    unit: null,
    plannedTime: null,
    startedAt: null,
    endedAt: null,
    actualValue: null,
    status: 'pending',
    pausedAt: null,
    pausedTotalSeconds: 0,
    accomplishment: null,
    createdAt: '2026-11-06T00:00:00Z',
    ...over,
  }
}

function nextStep(over: Partial<ComponentProps<typeof NextStep>> = {}) {
  return renderToStaticMarkup(
    h(NextStep, {
      running: null,
      pending: null,
      goal: undefined,
      stage: undefined,
      now: new Date('2026-11-06T10:00:00'),
      allResolved: false,
      doneCount: 0,
      sessionCount: 0,
      spontaneous: { picking: false, goals: [goal], onOpen: noop, onPick: noop },
      onContinue: noop,
      onStop: noop,
      onStart: noop,
      onIdeas: noop,
      onNewGoal: noop,
      ...over,
    }),
  )
}

describe('NextStep (el héroe de Hoy)', () => {
  it('sesión en curso: estado, etapa, reloj y acciones', () => {
    const running = session({ status: 'running', startedAt: '2026-11-06T09:55:00' })
    const html = nextStep({ running, goal, stage: { done: 1, total: 3, nextTitle: null } })
    expect(html).toContain('Sesión en curso')
    expect(html).toContain('Etapa 2 de 3')
    expect(html).toContain('Continuar sesión')
    expect(html).toContain('aria-label="Terminar la sesión"')
    expect(html).toContain('Correr 10K')
  })

  it('en pausa lo dice; una sesión de cantidad muestra hecho/objetivo', () => {
    const paused = session({ status: 'running', pausedAt: '2026-11-06T09:58:00', targetKind: 'count', targetValue: 10, actualValue: 3 })
    const html = nextStep({ running: paused, goal })
    expect(html).toContain('Sesión en pausa')
    expect(html).toContain('3/10')
    expect(html).not.toContain('Etapa')
  })

  it('siguiente sesión pendiente: sin hora y con lo comprometido', () => {
    const html = nextStep({ pending: session(), goal })
    expect(html).toContain('Siguiente sesión')
    expect(html).toContain('Sin hora')
    expect(html).toContain('comprometidos')
    expect(html).toContain('Empezar sesión')
  })

  it('día cerrado: todo, nada o parte, sin culpa', () => {
    const all = nextStep({ allResolved: true, doneCount: 2, sessionCount: 2 })
    expect(all).toContain('Cumpliste tu compromiso de hoy.')
    expect(all).toContain('chip-state--ok')
    expect(nextStep({ allResolved: true, doneCount: 0, sessionCount: 2 })).toContain(
      'Hoy no pudiste. Mañana se empieza de nuevo.',
    )
    const some = nextStep({ allResolved: true, doneCount: 1, sessionCount: 3 })
    expect(some).toContain('Cerraste el día: 1 de 3 cumplida.')
    expect(some).not.toContain('chip-state--ok')
    expect(some).toContain('Sesión espontánea')
  })

  it('día libre con metas activas: ofrece la sesión espontánea y luego elegir la meta', () => {
    expect(nextStep()).toContain('Día libre')
    const picking = nextStep({ spontaneous: { picking: true, goals: [goal], onOpen: noop, onPick: noop } })
    expect(picking).toContain('today-spont')
    expect(picking).not.toContain('Sesión espontánea')
  })

  it('sin metas activas invita a crear la primera', () => {
    const html = nextStep({ spontaneous: { picking: false, goals: [], onOpen: noop, onPick: noop } })
    expect(html).toContain('Ver ideas para empezar')
    expect(html).toContain('Escribir mi propia meta')
  })
})

function voice(over: Partial<ComponentProps<typeof TodayVoice>> = {}) {
  return renderToStaticMarkup(
    h(TodayVoice, {
      novedad: null,
      onCloseNovedad: noop,
      cheerMessage: null,
      cheerLeaving: false,
      streakBroken: null,
      onDismissStreak: noop,
      toResolve: null,
      onResolve: noop,
      reviewCount: 0,
      onReview: noop,
      forgotten: null,
      onForgottenSession: noop,
      onForgottenPause: noop,
      onForgottenAccept: noop,
      ...over,
    }),
  )
}

describe('TodayVoice (una sola voz por vista)', () => {
  const everything = {
    novedad: { id: 'n1', titulo: 'Agenda nueva', items: ['Ahora por bloques'] } as ComponentProps<typeof TodayVoice>['novedad'],
    cheerMessage: '¡Bien hecho!',
    streakBroken: { best: 5 },
    toResolve: { goalTitle: 'Correr 10K' },
    reviewCount: 2,
    forgotten: { goal, days: 6 },
  }

  it('respeta la prioridad: novedades > celebración > racha > abierta > revisión > olvidada', () => {
    expect(voice(everything)).toContain('Novedades · Agenda nueva')
    expect(voice({ ...everything, novedad: null })).toContain('¡Bien hecho!')
    expect(voice({ ...everything, novedad: null, cheerMessage: null })).toContain('Récord: 5 días.')
    const open = voice({ ...everything, novedad: null, cheerMessage: null, streakBroken: null })
    expect(open).toContain('Quedó una sesión abierta')
    expect(open).toContain('Correr 10K · ¿Cómo te fue?')
    const review = voice({ reviewCount: 2, forgotten: { goal, days: 6 } })
    expect(review).toContain('2 metas listas para revisar')
    expect(voice({ forgotten: { goal, days: 6 } })).toContain('Hace 6 días sin Correr 10K')
  })

  it('una sola meta para revisar va en singular; sin nada que decir, calla', () => {
    expect(voice({ reviewCount: 1 })).toContain('1 meta lista para revisar')
    expect(voice()).toBe('')
  })

  it('una sola fila a la vez', () => {
    expect(voice(everything).match(/today-row__glyph/g)).toHaveLength(1)
  })
})

function later(over: Partial<ComponentProps<typeof LaterSection>> = {}, sessions: Session[] = []) {
  const lookup: LaterLookup = {
    sessionOf: (id) => sessions.find((s) => s.id === id),
    habitOf: () => undefined,
    goalOf: (id) => (id === goal.id ? goal : undefined),
    onToggle: noop,
    onResume: noop,
    onReopen: noop,
    onOpen: noop,
  }
  return renderToStaticMarkup(
    h(LaterSection, {
      pending: [],
      done: [],
      lookup,
      hasPartialSession: false,
      yesterday: [],
      onBringYesterday: noop,
      onDismissYesterday: noop,
      addTask: { open: false, title: '', inputRef: createRef<HTMLInputElement>(), onToggle: noop, onTitle: noop, onSubmit: noop },
      ...over,
    }),
  )
}

const item = (over: Partial<LaterItem>): LaterItem => ({
  kind: 'task',
  id: 't1',
  title: 'Llamar al banco',
  subtitle: 'Tarea',
  startMin: null,
  done: false,
  ...over,
})

describe('LaterSection (más tarde hoy)', () => {
  it('sin nada pendiente lo dice', () => {
    expect(later()).toContain('Nada más por hoy')
  })

  it('una tarea se marca con el círculo', () => {
    const html = later({ pending: [item({})] })
    expect(html).toContain('aria-label="Marcar &quot;Llamar al banco&quot; como hecho"')
    expect(html).toContain('aria-pressed="false"')
  })

  it('una sesión se abre (pendiente), se retoma (parcial) o se deshace (hecha)', () => {
    const pending = later({ pending: [item({ kind: 'session', id: 's1', title: 'Correr' })] }, [session()])
    expect(pending).toContain('aria-label="Abrir la sesión &quot;Correr&quot;"')
    expect(pending).toContain('today-item__glyph--goal')

    const partial = later(
      { done: [item({ kind: 'session', id: 's1', done: true })], hasPartialSession: true },
      [session({ status: 'partial' })],
    )
    expect(partial).toContain('Retomar')
    expect(partial).toContain('today-item__check--static')
    expect(partial).toContain('Hecho hoy · 1')

    const done = later({ done: [item({ kind: 'session', id: 's1', done: true })] }, [session({ status: 'done' })])
    expect(done).toContain('Deshacer')
    expect(done).not.toContain('Retomar')
  })

  it('las tareas de ayer se ofrecen para traer o descartar, y ya no está "Nada más por hoy"', () => {
    const yesterday = [{ id: 'y1', title: 'Pagar luz' }, { id: 'y2', title: 'Comprar pan' }] as Task[]
    const html = later({ yesterday })
    expect(html).toContain('2 tareas de ayer')
    expect(html).toContain('Pagar luz · Comprar pan')
    expect(html).not.toContain('Nada más por hoy')
    expect(later({ yesterday: [yesterday[0]] })).toContain('1 tarea de ayer')
  })

  it('la entrada para agregar aparece abierta y no deja enviar vacío', () => {
    const html = later({
      addTask: { open: true, title: '  ', inputRef: createRef<HTMLInputElement>(), onToggle: noop, onTitle: noop, onSubmit: noop },
    })
    expect(html).toContain('aria-expanded="true"')
    expect(html).toMatch(/aria-label="Agregar tarea" disabled=""/)
  })
})

describe('TodayStats y WeekStrip', () => {
  it('hábitos completos se marcan; muchos segmentos pasan a barra proporcional', () => {
    const html = renderToStaticMarkup(
      h(TodayStats, { sessionsDone: 7, sessionsTotal: 14, habitsDone: 2, habitsTotal: 2, streak: 3, streakBumps: 1 }),
    )
    expect(html).toContain('today-stat__value--ok')
    expect(html).toContain('width:50%')
    expect(html).toContain('fc-bump')
  })

  it('hoy no navega y se describe en palabras', () => {
    const html = renderToStaticMarkup(
      h(WeekStrip, { today: '2026-11-06', stateOf: (d) => (d === '2026-11-06' ? 'partial' : 'free'), onOpenDay: noop }),
    )
    expect(html.match(/<button/g)).toHaveLength(7)
    expect(html).toMatch(/disabled="" aria-label="[^"]+ 06: hoy, a medias"/)
    expect(html).toContain('en la agenda: sin compromiso')
  })
})
