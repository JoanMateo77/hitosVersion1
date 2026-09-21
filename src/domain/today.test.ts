import { describe, expect, it } from 'vitest'
import {
  displayNameFrom,
  formatCommitted,
  formatElapsed,
  formatHeaderDate,
  frameCaption,
  greeting,
  initialsFrom,
  laterTodayItems,
  nextPendingSession,
  progressLine,
  SHORT_NICHE_LABELS,
} from '@/domain/today'
import type { CalendarEvent, Habit, HabitCheck, Session, Task } from '@/lib/types'

function session(over: Partial<Session> = {}): Session {
  return {
    id: 's1',
    goalId: 'g1',
    userId: 'u1',
    scheduleId: null,
    date: '2026-09-21',
    targetKind: 'time',
    targetValue: 25,
    unit: null,
    plannedTime: null,
    startedAt: null,
    endedAt: null,
    actualValue: null,
    status: 'pending',
    pausedAt: null,
    pausedTotalSeconds: 0,
    accomplishment: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  }
}

function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    title: 'Tomar agua',
    area: 'salud',
    weekdays: [],
    times: null,
    goalId: null,
    createdAt: '2026-06-01T00:00:00Z',
    archivedAt: null,
    ...over,
  }
}

function check(over: Partial<HabitCheck> = {}): HabitCheck {
  return { habitId: 'h1', date: '2026-09-21', slot: 0, ...over }
}

function task(over: Partial<Task> = {}): Task {
  return {
    id: 't1',
    userId: 'u1',
    goalId: null,
    title: 'Comprar leche',
    planDate: '2026-09-21',
    source: 'user',
    status: 'pending',
    createdAt: '2026-09-01T00:00:00Z',
    doneAt: null,
    ...over,
  }
}

function event(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    userId: 'u1',
    goalId: null,
    title: 'Dentista',
    notes: null,
    date: '2026-09-21',
    startTime: null,
    endTime: null,
    allDay: false,
    doneAt: null,
    createdAt: '2026-09-01T00:00:00Z',
    ...over,
  }
}

describe('greeting', () => {
  it('antes de las 12: Buenos días', () => {
    expect(greeting(0)).toBe('Buenos días')
    expect(greeting(11)).toBe('Buenos días')
  })
  it('límite 12: Buenas tardes', () => {
    expect(greeting(12)).toBe('Buenas tardes')
  })
  it('antes de las 19: Buenas tardes', () => {
    expect(greeting(18)).toBe('Buenas tardes')
  })
  it('límite 19 en adelante: Buenas noches', () => {
    expect(greeting(19)).toBe('Buenas noches')
    expect(greeting(23)).toBe('Buenas noches')
  })
})

describe('displayNameFrom', () => {
  it('usa la primera palabra de full_name', () => {
    expect(displayNameFrom({ full_name: 'María José Pérez' }, 'x@y.com')).toBe('María')
  })
  it('usa name si no hay full_name', () => {
    expect(displayNameFrom({ name: 'Carlos' }, 'x@y.com')).toBe('Carlos')
  })
  it('recorta espacios sobrantes', () => {
    expect(displayNameFrom({ full_name: '  Ana   ' }, 'x@y.com')).toBe('Ana')
  })
  it('ignora full_name/name vacíos o no-string y cae al email', () => {
    expect(displayNameFrom({ full_name: '', name: 123 }, 'joan.mateo@x.com')).toBe('Joan')
  })
  it('sin metadata usa la parte local del email hasta el primer separador', () => {
    expect(displayNameFrom(null, 'joan.mateo@x.com')).toBe('Joan')
    expect(displayNameFrom(undefined, 'joan_mateo@x.com')).toBe('Joan')
    expect(displayNameFrom(undefined, 'joan-mateo@x.com')).toBe('Joan')
    expect(displayNameFrom(undefined, 'joan+alias@x.com')).toBe('Joan')
    expect(displayNameFrom(undefined, 'joan99@x.com')).toBe('Joan')
  })
  it('email sin separador ni dígito: la parte local completa capitalizada', () => {
    expect(displayNameFrom(undefined, 'tecnologia@paymentsway.co')).toBe('Tecnologia')
  })
  it('email cuya parte local empieza con separador: cadena vacía', () => {
    expect(displayNameFrom(undefined, '.raro@x.com')).toBe('')
  })
})

describe('initialsFrom', () => {
  it('dos palabras: primera letra de cada una', () => {
    expect(initialsFrom('María José', 'x@y.com')).toBe('MJ')
  })
  it('una palabra: sus dos primeras letras', () => {
    expect(initialsFrom('Carlos', 'x@y.com')).toBe('CA')
  })
  it('sin nombre: dos primeras letras del email', () => {
    expect(initialsFrom('', 'ana@x.com')).toBe('AN')
  })
  it('sin nombre ni email: punto medio', () => {
    expect(initialsFrom('', '')).toBe('·')
  })
})

describe('formatHeaderDate', () => {
  it('formatea con el día de la semana capitalizado y coma', () => {
    expect(formatHeaderDate('2026-09-21')).toBe('Lunes, 21 de septiembre')
  })
})

describe('SHORT_NICHE_LABELS', () => {
  it('trae las 8 etiquetas cortas esperadas', () => {
    expect(SHORT_NICHE_LABELS).toEqual({
      salud: 'Salud',
      finanzas: 'Finanzas',
      carrera: 'Trabajo',
      aprendizaje: 'Aprendizaje',
      relaciones: 'Relaciones',
      creatividad: 'Crear',
      bienestar: 'Bienestar',
      otra: 'Otra',
    })
  })
})

describe('formatElapsed', () => {
  it('justo antes de la hora: m:ss', () => {
    expect(formatElapsed(3599)).toBe('59:59')
  })
  it('a la hora exacta: h:mm', () => {
    expect(formatElapsed(3600)).toBe('1:00')
  })
  it('más de una hora: h:mm con minutos con relleno', () => {
    expect(formatElapsed(9360)).toBe('2:36')
  })
  it('cero segundos', () => {
    expect(formatElapsed(0)).toBe('0:00')
  })
})

describe('formatCommitted', () => {
  it('tiempo: minutos exactos en horas', () => {
    expect(formatCommitted({ targetKind: 'time', targetValue: 120, unit: null })).toBe('2 h')
  })
  it('tiempo: horas con minutos', () => {
    expect(formatCommitted({ targetKind: 'time', targetValue: 150, unit: null })).toBe('2 h 30')
  })
  it('tiempo: menos de una hora', () => {
    expect(formatCommitted({ targetKind: 'time', targetValue: 25, unit: null })).toBe('25 min')
  })
  it('cantidad: valor y unidad', () => {
    expect(formatCommitted({ targetKind: 'count', targetValue: 10, unit: 'páginas' })).toBe(
      '10 páginas',
    )
  })
  it('cantidad sin unidad: recorta el espacio', () => {
    expect(formatCommitted({ targetKind: 'count', targetValue: 10, unit: null })).toBe('10')
  })
})

describe('progressLine', () => {
  const now = new Date('2026-09-21T10:00:00')
  it('tiempo: transcurrido humano de un objetivo comprometido', () => {
    const s = session({
      targetKind: 'time',
      targetValue: 30,
      startedAt: '2026-09-21T09:45:00',
    })
    expect(progressLine(s, now)).toBe('Llevas 15 min de 30 min comprometidas')
  })
  it('tiempo: sin arrancar el cronómetro, 0 min', () => {
    const s = session({ targetKind: 'time', targetValue: 30 })
    expect(progressLine(s, now)).toBe('Llevas 0 min de 30 min comprometidas')
  })
  it('cantidad: valor actual sobre el objetivo', () => {
    const s = session({ targetKind: 'count', targetValue: 10, unit: 'páginas', actualValue: 4 })
    expect(progressLine(s, now)).toBe('Llevas 4 de 10 páginas')
  })
  it('cantidad sin actualValue: cuenta como 0', () => {
    const s = session({ targetKind: 'count', targetValue: 10, unit: 'páginas', actualValue: null })
    expect(progressLine(s, now)).toBe('Llevas 0 de 10 páginas')
  })
})

describe('nextPendingSession', () => {
  it('elige la pendiente de hora más temprana', () => {
    const a = session({ id: 'a', plannedTime: '14:00' })
    const b = session({ id: 'b', plannedTime: '09:00' })
    const c = session({ id: 'c', plannedTime: '20:00' })
    expect(nextPendingSession([a, b, c])?.id).toBe('b')
  })
  it('las sin hora van después, en el orden dado', () => {
    const a = session({ id: 'a', plannedTime: null })
    const b = session({ id: 'b', plannedTime: '09:00' })
    expect(nextPendingSession([a, b])?.id).toBe('b')
  })
  it('todas sin hora: gana la primera en el orden dado', () => {
    const a = session({ id: 'a', plannedTime: null })
    const b = session({ id: 'b', plannedTime: null })
    expect(nextPendingSession([a, b])?.id).toBe('a')
  })
  it('ignora sesiones que no están pending', () => {
    const a = session({ id: 'a', status: 'done', plannedTime: '08:00' })
    const b = session({ id: 'b', status: 'pending', plannedTime: '10:00' })
    expect(nextPendingSession([a, b])?.id).toBe('b')
  })
  it('sin pendientes: null', () => {
    expect(nextPendingSession([session({ status: 'done' })])).toBeNull()
  })
})

describe('frameCaption', () => {
  it('sin marco ganado: "Sin marco"', () => {
    expect(frameCaption(0)).toBe('Sin marco')
    expect(frameCaption(2)).toBe('Sin marco')
  })
  it('con marco ganado: su nombre', () => {
    expect(frameCaption(3)).toBe('Bronce')
    expect(frameCaption(21)).toBe('Oro')
  })
})

describe('laterTodayItems', () => {
  const today = '2026-09-21'

  it('ordena por hora ascendente y deja sin hora al final', () => {
    const s1 = session({ id: 's1', plannedTime: '15:00' })
    const s2 = session({ id: 's2', plannedTime: '08:00' })
    const t1 = task({ id: 't1' })
    const items = laterTodayItems({
      sessions: [
        { session: s1, goalTitle: 'Meta A' },
        { session: s2, goalTitle: 'Meta B' },
      ],
      habits: [],
      habitChecks: [],
      tasks: [t1],
      events: [],
      today,
    })
    expect(items.map((i) => i.id)).toEqual(['s2', 's1', 't1'])
  })

  it('excluye la sesión del héroe y las en curso/sin confirmar', () => {
    const hero = session({ id: 'hero', plannedTime: '08:00' })
    const running = session({ id: 'running', status: 'running', plannedTime: '09:00' })
    const unconfirmed = session({ id: 'unc', status: 'unconfirmed', plannedTime: '10:00' })
    const visible = session({ id: 'vis', plannedTime: '11:00' })
    const items = laterTodayItems({
      sessions: [
        { session: hero, goalTitle: 'G' },
        { session: running, goalTitle: 'G' },
        { session: unconfirmed, goalTitle: 'G' },
        { session: visible, goalTitle: 'G' },
      ],
      habits: [],
      habitChecks: [],
      tasks: [],
      events: [],
      today,
      excludeSessionId: 'hero',
    })
    expect(items.map((i) => i.id)).toEqual(['vis'])
  })

  it('sesión con hora: subtítulo es el rango horario', () => {
    const s = session({ id: 's1', plannedTime: '09:00', targetKind: 'time', targetValue: 25 })
    const [item] = laterTodayItems({
      sessions: [{ session: s, goalTitle: 'Leer' }],
      habits: [],
      habitChecks: [],
      tasks: [],
      events: [],
      today,
    })
    expect(item.title).toBe('Sesión · Leer')
    expect(item.subtitle).toBe('9:00 am–9:25 am')
    expect(item.done).toBe(false)
  })

  it('sesión sin hora: subtítulo es el objetivo comprometido', () => {
    const s = session({ id: 's1', plannedTime: null, targetKind: 'count', targetValue: 10, unit: 'páginas' })
    const [item] = laterTodayItems({
      sessions: [{ session: s, goalTitle: 'Leer' }],
      habits: [],
      habitChecks: [],
      tasks: [],
      events: [],
      today,
    })
    expect(item.subtitle).toBe('10 páginas')
    expect(item.startMin).toBeNull()
  })

  it('sesión done/partial/missed cuenta como hecha', () => {
    for (const status of ['done', 'partial', 'missed'] as const) {
      const s = session({ id: `s-${status}`, status })
      const [item] = laterTodayItems({
        sessions: [{ session: s, goalTitle: 'G' }],
        habits: [],
        habitChecks: [],
        tasks: [],
        events: [],
        today,
      })
      expect(item.done).toBe(true)
    }
  })

  it('hábito con 3 repeticiones y 1 marcada: subtítulo con la próxima hora y el conteo', () => {
    const h = habit({ id: 'h1', times: ['08:00', '13:00', '20:00'] })
    const checks = [check({ habitId: 'h1', slot: 0 })]
    const [item] = laterTodayItems({
      sessions: [],
      habits: [h],
      habitChecks: checks,
      tasks: [],
      events: [],
      today,
    })
    expect(item.subtitle).toBe('próxima 1:00 pm · 1 de 3')
    expect(item.startMin).toBe(13 * 60)
    expect(item.done).toBe(false)
  })

  it('hábito de una sola repetición con hora: subtítulo es la hora', () => {
    const h = habit({ id: 'h1', times: ['07:30'] })
    const [item] = laterTodayItems({
      sessions: [],
      habits: [h],
      habitChecks: [],
      tasks: [],
      events: [],
      today,
    })
    expect(item.subtitle).toBe('7:30 am')
  })

  it('hábito de una sola repetición sin hora: "Sin hora"', () => {
    const h = habit({ id: 'h1', times: null })
    const [item] = laterTodayItems({
      sessions: [],
      habits: [h],
      habitChecks: [],
      tasks: [],
      events: [],
      today,
    })
    expect(item.subtitle).toBe('Sin hora')
    expect(item.startMin).toBeNull()
  })

  it('hábito completo: done true', () => {
    const h = habit({ id: 'h1', times: null })
    const [item] = laterTodayItems({
      sessions: [],
      habits: [h],
      habitChecks: [check({ habitId: 'h1' })],
      tasks: [],
      events: [],
      today,
    })
    expect(item.done).toBe(true)
  })

  it('solo incluye tareas del usuario, no pospuestas', () => {
    const own = task({ id: 'own', source: 'user', status: 'pending' })
    const fromGoal = task({ id: 'goal', source: 'goal' })
    const suggested = task({ id: 'sugg', source: 'suggested' })
    const postponed = task({ id: 'post', source: 'user', status: 'postponed' })
    const done = task({ id: 'done', source: 'user', status: 'done' })
    const items = laterTodayItems({
      sessions: [],
      habits: [],
      habitChecks: [],
      tasks: [own, fromGoal, suggested, postponed, done],
      events: [],
      today,
    })
    expect(items.map((i) => i.id).sort()).toEqual(['done', 'own'])
    expect(items.find((i) => i.id === 'own')?.subtitle).toBe('Sin hora')
    expect(items.find((i) => i.id === 'done')?.done).toBe(true)
  })

  it('evento de día completo o sin hora: "Todo el día"', () => {
    const allDay = event({ id: 'ad', allDay: true })
    const noTime = event({ id: 'nt', allDay: false, startTime: null })
    const items = laterTodayItems({
      sessions: [],
      habits: [],
      habitChecks: [],
      tasks: [],
      events: [allDay, noTime],
      today,
    })
    expect(items.every((i) => i.subtitle === 'Todo el día')).toBe(true)
    expect(items.every((i) => i.startMin === null)).toBe(true)
  })

  it('evento con hora: subtítulo es el rango; doneAt marca hecho', () => {
    const e = event({ id: 'e1', startTime: '18:00', endTime: '19:00', doneAt: '2026-09-21T18:30:00' })
    const [item] = laterTodayItems({
      sessions: [],
      habits: [],
      habitChecks: [],
      tasks: [],
      events: [e],
      today,
    })
    expect(item.subtitle).toBe('6:00 pm–7:00 pm')
    expect(item.startMin).toBe(18 * 60)
    expect(item.done).toBe(true)
  })

  it('empate en hora nula: orden sesión, hábito, evento, tarea', () => {
    const s = session({ id: 's1', plannedTime: null })
    const h = habit({ id: 'h1', times: null })
    const e = event({ id: 'e1', allDay: true })
    const t = task({ id: 't1' })
    const items = laterTodayItems({
      sessions: [{ session: s, goalTitle: 'G' }],
      habits: [h],
      habitChecks: [],
      tasks: [t],
      events: [e],
      today,
    })
    expect(items.map((i) => i.kind)).toEqual(['session', 'habit', 'event', 'task'])
  })

  it('sin nada para hoy: lista vacía', () => {
    expect(
      laterTodayItems({
        sessions: [],
        habits: [],
        habitChecks: [],
        tasks: [],
        events: [],
        today,
      }),
    ).toEqual([])
  })
})
