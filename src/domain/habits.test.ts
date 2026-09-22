import { describe, expect, it } from 'vitest'
import {
  archivedCaption,
  daysLabel,
  defaultColorFor,
  defaultIconFor,
  frequencyLabel,
  groupHabitsByArea,
  HABIT_COLORS,
  HABIT_ICONS,
  HABIT_SUGGESTIONS,
  habitAppliesOn,
  habitBestStreak,
  habitColor,
  habitCompleteDates,
  habitDayProgress,
  habitDayRow,
  habitDoneCount,
  habitIcon,
  habitIsComplete,
  habitMonthGrid,
  habitMonthStats,
  habitsDayStreak,
  habitsDueOn,
  habitStreak,
  habitStreakOf,
  habitTarget,
  habitTogglePlan,
  habitWeek,
  habitWithDayTimes,
  nextSlot,
  progressLabel,
  remindersLabel,
  skipKey,
  skipSetOf,
  todayHeadline,
  weekRings,
} from '@/domain/habits'
import { weekdayMon0 } from '@/domain/commitment'
import { addDays, startOfWeek, todayISO } from '@/lib/date'
import type { Habit, HabitCheck } from '@/lib/types'

// Fechas de referencia fijas: la semana del lunes 2026-06-08 al domingo 2026-06-14.
function habit(over: Partial<Habit> = {}): Habit {
  return {
    id: 'h1',
    userId: 'u1',
    title: 'Tomar agua',
    area: 'salud',
    weekdays: [],
    times: null,
    icon: null,
    color: null,
    unit: null,
    // Espeja el backfill de la migración 0016: un hábito con N horas ya era
    // "N veces al día". Los tests que prueban timesPerDay lo pasan explícito.
    timesPerDay: Math.max(1, over.times?.length ?? 0),
    pausedUntil: null,
    goalId: null,
    createdAt: '2026-06-01T00:00:00Z',
    archivedAt: null,
    ...over,
  }
}

function check(over: Partial<HabitCheck> = {}): HabitCheck {
  return { habitId: 'h1', date: '2026-06-08', slot: 0, ...over }
}

describe('habitAppliesOn', () => {
  it('weekdays vacío aplica todos los días', () => {
    const h = habit({ weekdays: [] })
    expect(habitAppliesOn(h, '2026-06-08')).toBe(true) // lunes
    expect(habitAppliesOn(h, '2026-06-13')).toBe(true) // sábado
    expect(habitAppliesOn(h, '2026-06-14')).toBe(true) // domingo
  })
  it('con weekdays específicos aplica solo esos días (lunes=0)', () => {
    const h = habit({ weekdays: [0, 2, 4] }) // Lu, Mi, Vi
    expect(habitAppliesOn(h, '2026-06-08')).toBe(true) // lunes
    expect(habitAppliesOn(h, '2026-06-10')).toBe(true) // miércoles
    expect(habitAppliesOn(h, '2026-06-09')).toBe(false) // martes
    expect(habitAppliesOn(h, '2026-06-14')).toBe(false) // domingo
  })
})

describe('habitsDueOn', () => {
  it('excluye archivados y los que no aplican ese día', () => {
    const habits = [
      habit({ id: 'diario' }),
      habit({ id: 'archivado', archivedAt: '2026-06-05T00:00:00Z' }),
      habit({ id: 'solo-lunes', weekdays: [0] }),
    ]
    // Martes 9: el de solo-lunes no toca y el archivado nunca aparece
    expect(habitsDueOn(habits, '2026-06-09').map((h) => h.id)).toEqual(['diario'])
  })
  it('ordena por createdAt ascendente', () => {
    const habits = [
      habit({ id: 'tercero', createdAt: '2026-06-03T00:00:00Z' }),
      habit({ id: 'primero', createdAt: '2026-06-01T00:00:00Z' }),
      habit({ id: 'segundo', createdAt: '2026-06-02T00:00:00Z' }),
    ]
    expect(habitsDueOn(habits, '2026-06-08').map((h) => h.id)).toEqual([
      'primero',
      'segundo',
      'tercero',
    ])
  })
})

describe('habitTarget', () => {
  it('sin horas la meta diaria es 1 (null y lista vacía)', () => {
    expect(habitTarget(habit({ times: null }))).toBe(1)
    expect(habitTarget(habit({ times: [] }))).toBe(1)
  })
  it('con horas, una repetición por hora', () => {
    expect(habitTarget(habit({ times: ['08:00', '13:00', '20:00'] }))).toBe(3)
  })
})

describe('habitWithDayTimes', () => {
  it('sin excepción devuelve el mismo hábito', () => {
    const h = habit({ times: ['08:00', '14:00'] })
    expect(habitWithDayTimes(h)).toBe(h)
    expect(habitWithDayTimes(h, null)).toBe(h)
  })

  it('la excepción del día reemplaza las horas, ordenadas', () => {
    const h = habit({ times: ['08:00', '14:00'] })
    const out = habitWithDayTimes(h, { times: ['19:00', '10:30'] })
    expect(out.times).toEqual(['10:30', '19:00'])
    expect(out.id).toBe(h.id)
    expect(habitTarget(out)).toBe(2)
  })

  it('excepción vacía deja el hábito sin hora fija ese día', () => {
    const h = habit({ times: ['08:00'] })
    expect(habitWithDayTimes(h, { times: [] }).times).toBeNull()
  })
})

describe('habitDoneCount', () => {
  it('cuenta solo los checks de ese hábito y esa fecha', () => {
    const checks = [
      check({ slot: 0 }),
      check({ slot: 1 }),
      check({ date: '2026-06-09', slot: 0 }),
      check({ habitId: 'otro', slot: 2 }),
    ]
    expect(habitDoneCount(checks, 'h1', '2026-06-08')).toBe(2)
    expect(habitDoneCount(checks, 'h1', '2026-06-09')).toBe(1)
    expect(habitDoneCount(checks, 'h1', '2026-06-10')).toBe(0)
  })
})

describe('habitIsComplete', () => {
  it('sin horas: un check completa el día', () => {
    expect(habitIsComplete(habit(), [check()], '2026-06-08')).toBe(true)
    expect(habitIsComplete(habit(), [], '2026-06-08')).toBe(false)
  })
  it('con horas: completo solo cuando están todas las repeticiones', () => {
    const h = habit({ times: ['08:00', '13:00', '20:00'] })
    const dos = [check({ slot: 0 }), check({ slot: 1 })]
    expect(habitIsComplete(h, dos, '2026-06-08')).toBe(false)
    expect(habitIsComplete(h, [...dos, check({ slot: 2 })], '2026-06-08')).toBe(true)
  })
})

describe('nextSlot', () => {
  const h = habit({ times: ['08:00', '13:00', '20:00'] })
  it('sin checks arranca en el slot 0', () => {
    expect(nextSlot(h, [], '2026-06-08')).toBe(0)
  })
  it('devuelve el primer hueco aunque haya slots posteriores marcados', () => {
    expect(nextSlot(h, [check({ slot: 0 }), check({ slot: 2 })], '2026-06-08')).toBe(1)
  })
  it('null cuando el día está completo', () => {
    const all = [check({ slot: 0 }), check({ slot: 1 }), check({ slot: 2 })]
    expect(nextSlot(h, all, '2026-06-08')).toBeNull()
  })
  it('sin horas: 0 pendiente, null tras el único check', () => {
    expect(nextSlot(habit(), [], '2026-06-08')).toBe(0)
    expect(nextSlot(habit(), [check()], '2026-06-08')).toBeNull()
  })
})

describe('habitCompleteDates', () => {
  it('multi-slot: solo cuentan los días con TODAS las repeticiones', () => {
    const h = habit({ times: ['08:00', '20:00'] })
    const checks = [
      check({ date: '2026-06-08', slot: 0 }),
      check({ date: '2026-06-08', slot: 1 }),
      check({ date: '2026-06-09', slot: 0 }), // parcial: no cuenta
      check({ habitId: 'otro', date: '2026-06-10', slot: 0 }),
    ]
    expect(habitCompleteDates(h, checks)).toEqual(new Set(['2026-06-08']))
  })
  it('sin horas equivale a "fechas con marca"', () => {
    const checks = [check({ date: '2026-06-08' }), check({ date: '2026-06-10' })]
    expect(habitCompleteDates(habit(), checks)).toEqual(new Set(['2026-06-08', '2026-06-10']))
  })
})

describe('habitStreak', () => {
  it('multi-slot: un día parcial (vía habitCompleteDates) corta la racha', () => {
    const h = habit({ times: ['08:00', '20:00'] })
    const checks = [
      check({ date: '2026-06-10', slot: 0 }),
      check({ date: '2026-06-10', slot: 1 }),
      check({ date: '2026-06-09', slot: 0 }), // parcial: el martes 9 no cuenta
      check({ date: '2026-06-08', slot: 0 }),
      check({ date: '2026-06-08', slot: 1 }),
    ]
    expect(habitStreak(habitCompleteDates(h, checks), [], '2026-06-10')).toBe(1)
  })

  it('weekdays vacío: cuenta días consecutivos marcados', () => {
    const checks = new Set(['2026-06-10', '2026-06-09', '2026-06-08'])
    expect(habitStreak(checks, [], '2026-06-10')).toBe(3)
  })
  it('hoy sin marcar no rompe la racha (queda en juego)', () => {
    const checks = new Set(['2026-06-09', '2026-06-08'])
    expect(habitStreak(checks, [], '2026-06-10')).toBe(2)
  })
  it('un día aplicable sin marcar (que ya pasó) corta la racha', () => {
    const checks = new Set(['2026-06-10', '2026-06-08']) // falta el martes 9
    expect(habitStreak(checks, [], '2026-06-10')).toBe(1)
  })
  it('salta los días no aplicables sin romper la racha', () => {
    // Lu, Mi, Vi marcados; hoy sábado 13 no aplica: la racha sigue viva en 3
    const checks = new Set(['2026-06-08', '2026-06-10', '2026-06-12'])
    expect(habitStreak(checks, [0, 2, 4], '2026-06-13')).toBe(3)
  })
  it('con weekdays específicos, hoy aplicable sin marcar tampoco rompe', () => {
    // hoy viernes 12 sin marcar; Mi 10 y Lu 8 hechos
    const checks = new Set(['2026-06-10', '2026-06-08'])
    expect(habitStreak(checks, [0, 2, 4], '2026-06-12')).toBe(2)
  })
  it('sin marcas la racha es 0', () => {
    expect(habitStreak(new Set(), [], '2026-06-10')).toBe(0)
  })
})

describe('habitWeek', () => {
  // habitWeek usa la fecha real de hoy, así que armamos semanas relativas a ella
  // para que el test sea determinístico sin importar cuándo corra.
  const thisMonday = startOfWeek(todayISO())

  it('semana completa marcada: los 7 días en done (lunes primero)', () => {
    const h = habit({ weekdays: [] })
    const checks = new Set(Array.from({ length: 7 }, (_, i) => addDays(thisMonday, i)))
    expect(habitWeek(checks, h, thisMonday)).toEqual(Array(7).fill('done'))
  })

  it('semana pasada sin marcas: missed en días aplicables y free en el resto', () => {
    const pastMonday = addDays(thisMonday, -14)
    const h = habit({ weekdays: [0, 2, 4] }) // Lu, Mi, Vi
    expect(habitWeek(new Set(), h, pastMonday)).toEqual([
      'missed', 'free', 'missed', 'free', 'missed', 'free', 'free',
    ])
  })

  it('semana pasada con mezcla: marcado gana, lo aplicable sin marcar queda missed', () => {
    const pastMonday = addDays(thisMonday, -14)
    const h = habit({ weekdays: [] })
    const checks = new Set([pastMonday, addDays(pastMonday, 1), addDays(pastMonday, 3)])
    expect(habitWeek(checks, h, pastMonday)).toEqual([
      'done', 'done', 'missed', 'done', 'missed', 'missed', 'missed',
    ])
  })

  it('semana futura: lo aplicable sin marcar queda due, no missed', () => {
    const nextMonday = addDays(thisMonday, 7)
    const h = habit({ weekdays: [] })
    const checks = new Set([addDays(nextMonday, 2)])
    expect(habitWeek(checks, h, nextMonday)).toEqual([
      'due', 'due', 'done', 'due', 'due', 'due', 'due',
    ])
  })

  it('hoy aplicable sin marcar es due (todavía se puede cumplir)', () => {
    const today = todayISO()
    const todayIdx = weekdayMon0(today)
    const h = habit({ weekdays: [todayIdx] }) // solo aplica hoy
    const expected = Array(7).fill('free')
    expected[todayIdx] = 'due'
    expect(habitWeek(new Set(), h, thisMonday)).toEqual(expected)
  })
})

describe('habitDayRow', () => {
  it('sin horas: una repetición, sin hora, completo con una marca', () => {
    const h = habit({ times: null })
    expect(habitDayRow(h, [], '2026-06-08')).toEqual({ doneCount: 0, target: 1, complete: false, time: null })
    expect(habitDayRow(h, [check()], '2026-06-08')).toEqual({ doneCount: 1, target: 1, complete: true, time: null })
  })
  it('con horas: la hora es la de la PRÓXIMA repetición pendiente', () => {
    const h = habit({ times: ['08:00', '11:00', '14:00'] })
    const checks = [check({ slot: 0 })]
    expect(habitDayRow(h, checks, '2026-06-08')).toEqual({ doneCount: 1, target: 3, complete: false, time: '11:00' })
  })
  it('completo: la hora es la última y doneCount no supera el target', () => {
    const h = habit({ times: ['08:00', '11:00'] })
    const checks = [check({ slot: 0 }), check({ slot: 1 }), check({ slot: 2 })]
    expect(habitDayRow(h, checks, '2026-06-08')).toEqual({ doneCount: 2, target: 2, complete: true, time: '11:00' })
  })
  it('ignora marcas de otros días u otros hábitos', () => {
    const h = habit({ times: ['08:00'] })
    const checks = [check({ date: '2026-06-07' }), check({ habitId: 'otro' })]
    expect(habitDayRow(h, checks, '2026-06-08').doneCount).toBe(0)
  })
})

describe('habitTogglePlan', () => {
  it('con repeticiones pendientes marca la siguiente', () => {
    const h = habit({ times: ['08:00', '11:00', '14:00'] })
    expect(habitTogglePlan(h, [check({ slot: 0 })], '2026-06-08')).toEqual({ slot: 1, add: true })
  })
  it('completo: desmarca la ÚLTIMA', () => {
    const h = habit({ times: ['08:00', '11:00'] })
    expect(habitTogglePlan(h, [check({ slot: 0 }), check({ slot: 1 })], '2026-06-08')).toEqual({ slot: 1, add: false })
  })
  it('sin horas es el toggle de siempre (slot 0)', () => {
    const h = habit({ times: null })
    expect(habitTogglePlan(h, [], '2026-06-08')).toEqual({ slot: 0, add: true })
    expect(habitTogglePlan(h, [check()], '2026-06-08')).toEqual({ slot: 0, add: false })
  })
})

/* ===== Zona nueva (rediseño 2026-09-22) ================================== */

describe('skipKey / skipSetOf', () => {
  it('la clave junta hábito y fecha', () => {
    expect(skipKey('h1', '2026-06-08')).toBe('h1|2026-06-08')
  })
  it('skipSetOf arma el Set que esperan las demás funciones', () => {
    const set = skipSetOf([
      { habitId: 'h1', date: '2026-06-08' },
      { habitId: 'h2', date: '2026-06-09' },
    ])
    expect(set.has(skipKey('h1', '2026-06-08'))).toBe(true)
    expect(set.has(skipKey('h1', '2026-06-09'))).toBe(false)
    expect(set.size).toBe(2)
  })
})

describe('habitAppliesOn con pausa y saltos', () => {
  it('un día saltado no aplica', () => {
    const h = habit()
    const skips = skipSetOf([{ habitId: 'h1', date: '2026-06-09' }])
    expect(habitAppliesOn(h, '2026-06-09', skips)).toBe(false)
    expect(habitAppliesOn(h, '2026-06-10', skips)).toBe(true)
  })
  it('pausado hasta una fecha: esa fecha inclusive no aplica, la siguiente sí', () => {
    const h = habit({ pausedUntil: '2026-06-10' })
    expect(habitAppliesOn(h, '2026-06-10')).toBe(false)
    expect(habitAppliesOn(h, '2026-06-11')).toBe(true)
  })
  it('habitsDueOn respeta saltos y pausa', () => {
    const habits = [
      habit({ id: 'salta' }),
      habit({ id: 'pausado', pausedUntil: '2026-06-09' }),
      habit({ id: 'normal' }),
    ]
    const skips = skipSetOf([{ habitId: 'salta', date: '2026-06-09' }])
    expect(habitsDueOn(habits, '2026-06-09', skips).map((h) => h.id)).toEqual(['normal'])
  })
})

describe('habitTarget con timesPerDay', () => {
  it('manda timesPerDay, aunque haya menos horas de recordatorio', () => {
    expect(habitTarget(habit({ timesPerDay: 5, times: ['09:00'] }))).toBe(5)
  })
  it('una vez al día con varias horas de recordatorio sigue siendo 1', () => {
    expect(habitTarget(habit({ timesPerDay: 1, times: ['09:00', '13:00'] }))).toBe(1)
  })
})

describe('habitDayProgress', () => {
  it('cuenta hechas, objetivo y cierre del día (sin pasarse del objetivo)', () => {
    const h = habit({ timesPerDay: 3 })
    expect(habitDayProgress(h, [], '2026-06-08')).toEqual({ done: 0, target: 3, complete: false })
    const dos = [check({ slot: 0 }), check({ slot: 1 })]
    expect(habitDayProgress(h, dos, '2026-06-08')).toEqual({ done: 2, target: 3, complete: false })
    const cuatro = [...dos, check({ slot: 2 }), check({ slot: 3 })]
    expect(habitDayProgress(h, cuatro, '2026-06-08')).toEqual({ done: 3, target: 3, complete: true })
  })
})

describe('habitDayRow con más repeticiones que horas', () => {
  const h = habit({ timesPerDay: 3, times: ['09:00'] })
  it('la repetición sin hora (slot >= times.length) no muestra ninguna', () => {
    expect(habitDayRow(h, [], '2026-06-08').time).toBe('09:00')
    expect(habitDayRow(h, [check({ slot: 0 })], '2026-06-08').time).toBeNull()
  })
  it('completo: cae en la última repetición que sí tiene hora', () => {
    const todas = [check({ slot: 0 }), check({ slot: 1 }), check({ slot: 2 })]
    expect(habitDayRow(h, todas, '2026-06-08')).toEqual({
      doneCount: 3, target: 3, complete: true, time: '09:00',
    })
  })
})

describe('habitStreakOf', () => {
  const sin = new Set<string>()
  const hechos = (fechas: string[]) => fechas.map((date) => check({ date }))

  it('cuenta días seguidos completos', () => {
    const checks = hechos(['2026-06-08', '2026-06-09', '2026-06-10'])
    expect(habitStreakOf(habit(), checks, sin, '2026-06-10')).toBe(3)
  })
  it('hoy sin marcar no rompe la racha', () => {
    const checks = hechos(['2026-06-08', '2026-06-09'])
    expect(habitStreakOf(habit(), checks, sin, '2026-06-10')).toBe(2)
  })
  it('un día saltado se salta sin romperla', () => {
    const checks = hechos(['2026-06-08', '2026-06-10'])
    const skips = skipSetOf([{ habitId: 'h1', date: '2026-06-09' }])
    expect(habitStreakOf(habit(), checks, skips, '2026-06-10')).toBe(2)
    // Sin el salto, el martes 9 sin marcar sí la corta.
    expect(habitStreakOf(habit(), checks, sin, '2026-06-10')).toBe(1)
  })
  it('la pausa congela la racha en vez de romperla', () => {
    const h = habit({ pausedUntil: '2026-06-12' })
    const checks = hechos(['2026-06-08', '2026-06-09', '2026-06-10'])
    expect(habitStreakOf(h, checks, sin, '2026-06-12')).toBe(3)
  })
  it('la pausa no une tramos viejos: hacia atrás deja de valer tras lo cumplido', () => {
    const h = habit({ pausedUntil: '2026-06-12' })
    const checks = hechos(['2026-06-10', '2026-06-01'])
    expect(habitStreakOf(h, checks, sin, '2026-06-12')).toBe(1)
  })
  it('sin marcas la racha es 0', () => {
    expect(habitStreakOf(habit(), [], sin, '2026-06-10')).toBe(0)
  })
})

describe('habitBestStreak', () => {
  const sin = new Set<string>()
  const hechos = (fechas: string[]) => fechas.map((date) => check({ date }))

  it('se queda con el tramo más largo de la ventana', () => {
    const checks = hechos([
      '2026-06-01', '2026-06-02', '2026-06-03',
      '2026-06-06', '2026-06-07', '2026-06-08', '2026-06-09',
    ])
    expect(habitBestStreak(habit(), checks, sin, '2026-06-01', '2026-06-10')).toBe(4)
  })
  it('los días saltados no cortan el tramo', () => {
    const checks = hechos(['2026-06-01', '2026-06-02', '2026-06-04'])
    const skips = skipSetOf([{ habitId: 'h1', date: '2026-06-03' }])
    expect(habitBestStreak(habit(), checks, skips, '2026-06-01', '2026-06-04')).toBe(3)
    expect(habitBestStreak(habit(), checks, sin, '2026-06-01', '2026-06-04')).toBe(2)
  })
  it('ventana vacía o al revés: 0', () => {
    expect(habitBestStreak(habit(), [], sin, '2026-06-01', '2026-06-10')).toBe(0)
    expect(habitBestStreak(habit(), [], sin, '2026-06-10', '2026-06-01')).toBe(0)
  })
})

describe('habitMonthStats', () => {
  const sin = new Set<string>()
  it('solo cuenta los días aplicables ya transcurridos (hoy inclusive)', () => {
    const checks = ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-04', '2026-07-05'].map(
      (date) => check({ date }),
    )
    // Julio tiene 31 días, pero hoy es el 6: la ventana es del 1 al 6.
    expect(habitMonthStats(habit(), checks, sin, '2026-07-01', '2026-07-06')).toEqual({
      done: 5,
      applicable: 6,
      ratio: 5 / 6,
    })
  })
  it('los días que no tocan no entran en el denominador', () => {
    const h = habit({ weekdays: [0, 1, 2, 3, 4] }) // Lu a Vi
    const checks = ['2026-07-01', '2026-07-02', '2026-07-03'].map((date) => check({ date }))
    // Del 1 (miércoles) al 5 (domingo) solo aplican mié, jue y vie.
    expect(habitMonthStats(h, checks, sin, '2026-07-01', '2026-07-05')).toEqual({
      done: 3,
      applicable: 3,
      ratio: 1,
    })
  })
  it('mes sin días aplicables transcurridos: ratio 0 sin dividir por cero', () => {
    expect(habitMonthStats(habit(), [], sin, '2026-07-01', '2026-06-30')).toEqual({
      done: 0,
      applicable: 0,
      ratio: 0,
    })
  })
})

describe('habitMonthGrid', () => {
  const sin = new Set<string>()
  it('arranca con los huecos hasta el primer día y trae todo el mes', () => {
    // El 1 de julio de 2026 es miércoles: dos huecos antes (lunes y martes).
    const cells = habitMonthGrid(habit(), [], sin, '2026-07-01', '2026-07-06')
    expect(cells).toHaveLength(2 + 31)
    expect(cells.slice(0, 2)).toEqual([
      { date: null, state: 'blank' },
      { date: null, state: 'blank' },
    ])
    expect(cells[2].date).toBe('2026-07-01')
    expect(cells[cells.length - 1].date).toBe('2026-07-31')
  })

  it('estados: done, partial, missed, skipped, free y future', () => {
    const h = habit({ timesPerDay: 2, weekdays: [0, 1, 2, 3, 4] }) // Lu a Vi
    const checks = [
      check({ date: '2026-07-01', slot: 0 }),
      check({ date: '2026-07-01', slot: 1 }), // completo
      check({ date: '2026-07-02', slot: 0 }), // a medias
    ]
    const skips = skipSetOf([{ habitId: 'h1', date: '2026-07-06' }])
    const byDate = new Map(
      habitMonthGrid(h, checks, skips, '2026-07-01', '2026-07-07').map((c) => [c.date, c.state]),
    )
    expect(byDate.get('2026-07-01')).toBe('done')
    expect(byDate.get('2026-07-02')).toBe('partial')
    expect(byDate.get('2026-07-03')).toBe('missed') // viernes sin marcar, ya pasó
    expect(byDate.get('2026-07-04')).toBe('free') // sábado: no toca
    expect(byDate.get('2026-07-05')).toBe('free') // domingo: no toca
    expect(byDate.get('2026-07-06')).toBe('skipped')
    expect(byDate.get('2026-07-07')).toBe('future') // hoy todavía se puede cumplir
    expect(byDate.get('2026-07-08')).toBe('future')
  })
})

describe('etiquetas', () => {
  it('frequencyLabel distingue una vez de varias', () => {
    expect(frequencyLabel(habit({ timesPerDay: 1 }))).toBe('Una vez al día')
    expect(frequencyLabel(habit({ timesPerDay: 5 }))).toBe('5 veces al día')
  })

  it('daysLabel: todos, tramo contiguo, fin de semana y sueltos', () => {
    expect(daysLabel([])).toBe('Todos los días')
    expect(daysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('Todos los días')
    expect(daysLabel([0, 1, 2, 3, 4])).toBe('Lu a Vi')
    expect(daysLabel([2, 3, 4])).toBe('Mi a Vi')
    expect(daysLabel([5, 6])).toBe('Fin de semana')
    expect(daysLabel([1, 3, 5])).toBe('Ma · Ju · Sa')
    expect(daysLabel([0, 1])).toBe('Lu · Ma') // contiguo pero corto
    expect(daysLabel([4, 0])).toBe('Lu · Vi') // desordenado: se ordena
  })

  it('remindersLabel: horas sin el cero de la izquierda o "Sin recordatorios"', () => {
    expect(remindersLabel(['09:00', '13:00', '17:00'])).toBe('9:00, 13:00, 17:00')
    expect(remindersLabel([])).toBe('Sin recordatorios')
    expect(remindersLabel(null)).toBe('Sin recordatorios')
  })

  it('progressLabel usa la unidad cuando la hay', () => {
    expect(progressLabel(habit({ timesPerDay: 5, unit: 'vasos' }), 1)).toBe('1 de 5 vasos')
    expect(progressLabel(habit({ timesPerDay: 5 }), 1)).toBe('1 de 5')
  })

  it('archivedCaption: cuándo se archivó y la mejor racha', () => {
    const hoy = '2026-09-22'
    const arch = (date: string) => habit({ archivedAt: `${date}T10:00:00Z` })
    expect(archivedCaption(arch('2026-09-22'), 0, hoy)).toBe('Archivado hoy')
    expect(archivedCaption(arch('2026-09-21'), 0, hoy)).toBe('Archivado hace 1 día')
    expect(archivedCaption(arch('2026-09-19'), 0, hoy)).toBe('Archivado hace 3 días')
    expect(archivedCaption(arch('2026-09-08'), 0, hoy)).toBe('Archivado hace 2 semanas')
    expect(archivedCaption(arch('2026-07-24'), 0, hoy)).toBe('Archivado hace 2 meses')
    expect(archivedCaption(arch('2026-06-10'), 0, hoy)).toBe('Archivado en junio')
    expect(archivedCaption(arch('2026-09-22'), 64, hoy)).toBe(
      'Archivado hoy · mejor racha 64 días',
    )
    expect(archivedCaption(arch('2026-09-22'), 1, hoy)).toBe('Archivado hoy · mejor racha 1 día')
  })
})

describe('groupHabitsByArea', () => {
  it('agrupa en el orden de NICHES y sin áreas vacías', () => {
    const habits = [
      habit({ id: 'b1', area: 'bienestar' }),
      habit({ id: 's1', area: 'salud' }),
      habit({ id: 's2', area: 'salud' }),
    ]
    expect(groupHabitsByArea(habits)).toEqual([
      { area: 'salud', label: 'Salud y cuerpo', habits: [habits[1], habits[2]] },
      { area: 'bienestar', label: 'Bienestar', habits: [habits[0]] },
    ])
  })
  it('sin hábitos no hay grupos', () => {
    expect(groupHabitsByArea([])).toEqual([])
  })
})

describe('weekRings', () => {
  const sin = new Set<string>()
  it('una proporción por día, con la fase respecto de hoy', () => {
    const habits = [habit({ id: 'h1' }), habit({ id: 'h2', weekdays: [0] })] // h2 solo lunes
    const checks = [
      check({ habitId: 'h1', date: '2026-06-08' }),
      check({ habitId: 'h2', date: '2026-06-08' }),
      check({ habitId: 'h1', date: '2026-06-09' }),
    ]
    const rings = weekRings(habits, checks, sin, '2026-06-08', '2026-06-10')
    expect(rings).toHaveLength(7)
    expect(rings[0]).toEqual({ date: '2026-06-08', ratio: 1, phase: 'past' })
    expect(rings[1]).toEqual({ date: '2026-06-09', ratio: 1, phase: 'past' })
    expect(rings[2]).toEqual({ date: '2026-06-10', ratio: 0, phase: 'today' })
    expect(rings[3]).toEqual({ date: '2026-06-11', ratio: 0, phase: 'future' })
  })
  it('un día sin hábitos aplicables queda en 0 sin dividir por cero', () => {
    const habits = [habit({ id: 'h2', weekdays: [0] })]
    const rings = weekRings(habits, [], sin, '2026-06-08', '2026-06-10')
    expect(rings[1].ratio).toBe(0)
  })
})

describe('habitsDayStreak', () => {
  const sin = new Set<string>()
  it('cuenta días con TODOS los aplicables hechos; hoy incompleto no rompe', () => {
    const habits = [habit({ id: 'h1' }), habit({ id: 'h2', weekdays: [0] })]
    const checks = [
      check({ habitId: 'h1', date: '2026-06-09' }),
      check({ habitId: 'h1', date: '2026-06-08' }),
      check({ habitId: 'h2', date: '2026-06-08' }),
    ]
    expect(habitsDayStreak(habits, checks, sin, '2026-06-10')).toBe(2)
  })
  it('los días sin hábitos aplicables se saltan', () => {
    const habits = [habit({ id: 'h2', weekdays: [0] })] // solo lunes
    const checks = [
      check({ habitId: 'h2', date: '2026-06-08' }),
      check({ habitId: 'h2', date: '2026-06-01' }),
    ]
    expect(habitsDayStreak(habits, checks, sin, '2026-06-10')).toBe(2)
  })
  it('un día incompleto corta, y sin hábitos activos es 0', () => {
    const habits = [habit({ id: 'h1' })]
    const checks = [check({ habitId: 'h1', date: '2026-06-09' })]
    expect(habitsDayStreak(habits, checks, sin, '2026-06-10')).toBe(1)
    expect(habitsDayStreak([], [], sin, '2026-06-10')).toBe(0)
    const archivados = [habit({ id: 'h1', archivedAt: '2026-06-05T00:00:00Z' })]
    expect(habitsDayStreak(archivados, checks, sin, '2026-06-10')).toBe(0)
  })
})

describe('todayHeadline', () => {
  const sin = new Set<string>()
  it('completos sobre aplicables de hoy', () => {
    const habits = [
      habit({ id: 'h1' }),
      habit({ id: 'h2' }),
      habit({ id: 'h3', weekdays: [0] }), // lunes: hoy (miércoles) no cuenta
      habit({ id: 'h4', archivedAt: '2026-06-05T00:00:00Z' }),
    ]
    const checks = [check({ habitId: 'h1', date: '2026-06-10' })]
    expect(todayHeadline(habits, checks, sin, '2026-06-10')).toEqual({ done: 1, total: 2 })
  })
  it('un hábito saltado hoy sale de la cuenta', () => {
    const habits = [habit({ id: 'h1' }), habit({ id: 'h2' })]
    const skips = skipSetOf([{ habitId: 'h2', date: '2026-06-10' }])
    expect(todayHeadline(habits, [], skips, '2026-06-10')).toEqual({ done: 0, total: 1 })
  })
})

describe('catálogos de identidad', () => {
  it('las 8 claves de color, en el orden del selector', () => {
    expect(HABIT_COLORS).toEqual([
      'cyan', 'green', 'blue', 'purple', 'orange', 'yellow', 'pink', 'gray',
    ])
  })
  it('el catálogo de iconos empieza por los 7 del mockup y no repite', () => {
    expect(HABIT_ICONS.slice(0, 7)).toEqual(['💧', '🏃', '📖', '🧘', '💤', '🥗', '✍️'])
    expect(HABIT_ICONS.length).toBeGreaterThanOrEqual(30)
    expect(new Set(HABIT_ICONS).size).toBe(HABIT_ICONS.length)
  })
  it('icono y color caen al área cuando el hábito no los tiene', () => {
    expect(habitIcon(habit({ area: 'salud' }))).toBe('💪')
    expect(habitIcon(habit({ area: 'otra' }))).toBe('✨')
    expect(habitIcon(habit({ area: 'salud', icon: '💧' }))).toBe('💧')
    expect(habitColor(habit({ area: 'salud' }))).toBe('green')
    expect(habitColor(habit({ area: 'aprendizaje' }))).toBe('purple')
    expect(habitColor(habit({ area: 'salud', color: 'pink' }))).toBe('pink')
    expect(defaultIconFor('finanzas')).toBe('💰')
    expect(defaultColorFor('finanzas')).toBe('yellow')
  })
  it('las sugerencias traen todo lo que precarga la hoja', () => {
    expect(HABIT_SUGGESTIONS).toHaveLength(8)
    expect(HABIT_SUGGESTIONS[0]).toEqual({
      title: 'Beber agua',
      icon: '💧',
      color: 'cyan',
      area: 'salud',
      timesPerDay: 5,
      unit: 'vasos',
      weekdays: [],
    })
    for (const s of HABIT_SUGGESTIONS) {
      expect(HABIT_COLORS).toContain(s.color)
      expect(s.timesPerDay).toBeGreaterThanOrEqual(1)
    }
  })
})
