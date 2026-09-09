import { describe, expect, it } from 'vitest'
import { weekDaySummary, type DayAgendaSession, type DayHabitRowItem } from '@/screens/calendar/agendaItems'
import type { CalendarEvent, Goal, Habit } from '@/lib/types'

function goal(over: Partial<Goal> = {}): Goal {
  return {
    id: 'g1', userId: 'u1', title: 'Aprender inglés', why: null, targetDate: null, area: 'aprendizaje',
    successCriteria: null, templateKey: 'x', lastReviewedAt: null, status: 'active',
    createdAt: '2026-06-01T00:00:00Z', completedAt: null, ...over,
  }
}
function session(over: Partial<DayAgendaSession> = {}): DayAgendaSession {
  return {
    key: 's1', goal: goal(), time: '08:00', span: { start: '08:00', end: '08:45' }, state: 'pending',
    targetLabel: '45 min', session: null, block: null, ...over,
  }
}
function habitRow(over: Partial<DayHabitRowItem> = {}): DayHabitRowItem {
  const habit: Habit = {
    id: 'h1', userId: 'u1', title: 'Tomar agua', area: 'salud', weekdays: [], times: null,
    goalId: null, createdAt: '2026-06-01T00:00:00Z', archivedAt: null,
  }
  return { key: 'h-h1', habit, doneCount: 0, target: 1, complete: false, time: null, ...over }
}
function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1', userId: 'u1', goalId: null, title: 'Dentista', notes: null, date: '2026-06-09',
    startTime: null, endTime: null, allDay: false, doneAt: null, createdAt: '2026-06-01T00:00:00Z', ...over,
  }
}
const base = { day: '2026-06-09', today: '2026-06-09', sessions: [], habits: [], events: [], deadlines: [] }

describe('weekDaySummary', () => {
  it('día vacío', () => {
    expect(weekDaySummary(base)).toEqual({ main: 'Nada agendado', sub: null, dots: [] })
  })
  it('hoy: "X de N sesiones" y el resto en la línea secundaria, con un punto por meta', () => {
    const s = weekDaySummary({
      ...base,
      sessions: [session({ state: 'done' }), session({ key: 's2', goal: goal({ id: 'g2', area: 'salud' }) })],
      habits: [habitRow({ complete: true }), habitRow({ key: 'h-h2' })],
      events: [ev()],
      deadlines: [goal({ id: 'g9', title: 'Ahorrar para el viaje' })],
    })
    expect(s.main).toBe('1 de 2 sesiones')
    expect(s.sub).toBe('Hábitos 1 de 2 · 1 evento · Meta: Ahorrar para el viaje')
    expect(s.dots).toEqual(['aprendizaje', 'salud'])
  })
  it('día pasado con todo cumplido: "N sesiones cumplidas"', () => {
    const s = weekDaySummary({ ...base, day: '2026-06-08', sessions: [session({ state: 'done' })] })
    expect(s.main).toBe('1 sesión cumplida')
  })
  it('día pasado con una done y una partial: la parcial también cuenta como cumplida', () => {
    const s = weekDaySummary({
      ...base,
      day: '2026-06-08',
      sessions: [session({ state: 'done' }), session({ key: 's2', state: 'partial' })],
    })
    expect(s.main).toBe('2 sesiones cumplidas')
  })
  it('día pasado con una done y una pending: "X de N" (no todas cumplidas)', () => {
    const s = weekDaySummary({
      ...base,
      day: '2026-06-08',
      sessions: [session({ state: 'done' }), session({ key: 's2', state: 'pending' })],
    })
    expect(s.main).toBe('1 de 2 sesiones')
  })
  it('día pasado con dos done: "2 sesiones cumplidas"', () => {
    const s = weekDaySummary({
      ...base,
      day: '2026-06-08',
      sessions: [session({ state: 'done' }), session({ key: 's2', state: 'done' })],
    })
    expect(s.main).toBe('2 sesiones cumplidas')
  })
  it('día futuro: "N sesiones" y "N hábitos"', () => {
    const s = weekDaySummary({ ...base, day: '2026-06-10', sessions: [session()], habits: [habitRow()] })
    expect(s.main).toBe('1 sesión')
    expect(s.sub).toBe('1 hábito')
  })
  it('sin sesiones, lo primero que exista es la línea principal', () => {
    const s = weekDaySummary({ ...base, events: [ev(), ev({ id: 'e2' })] })
    expect(s.main).toBe('2 eventos')
    expect(s.sub).toBeNull()
  })
  it('varias metas con fecha se cuentan', () => {
    const s = weekDaySummary({ ...base, deadlines: [goal({ id: 'a' }), goal({ id: 'b' })] })
    expect(s.main).toBe('2 metas con fecha')
  })
})
