import { describe, expect, it } from 'vitest'
import {
  habitAppliesOn,
  habitCompleteDates,
  habitDoneCount,
  habitIsComplete,
  habitStreak,
  habitTarget,
  habitsDueOn,
  habitWeek,
  habitWithDayTimes,
  nextSlot,
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
    expect(nextSlot(h, all, '2026-06-08')).toBe(null)
  })
  it('sin horas: 0 pendiente, null tras el único check', () => {
    expect(nextSlot(habit(), [], '2026-06-08')).toBe(0)
    expect(nextSlot(habit(), [check()], '2026-06-08')).toBe(null)
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
