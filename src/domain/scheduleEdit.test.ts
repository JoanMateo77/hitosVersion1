import { describe, expect, it } from 'vitest'
import {
  diffSchedule,
  editBlockDays,
  editBlockValue,
  sessionsToSync,
  type ScheduleChange,
} from '@/domain/scheduleEdit'
import type { CommitmentBlockDraft } from '@/domain/commitment'
import type { ScheduleBlock, Session, SessionStatus } from '@/lib/types'

function block(
  id: string,
  weekday: number,
  targetValue = 30,
  startTime: string | null = null,
  createdAt = '2026-10-01T00:00:00Z',
): ScheduleBlock {
  return {
    id,
    goalId: 'g1',
    userId: 'u1',
    weekday,
    targetKind: 'time',
    targetValue,
    unit: null,
    startTime,
    createdAt,
  }
}

/** Draft equivalente al bloque (con su id), como lo arma openCommitmentEditor. */
function draftOf(b: ScheduleBlock, withId = true): CommitmentBlockDraft {
  const draft: CommitmentBlockDraft = {
    weekday: b.weekday,
    targetKind: b.targetKind,
    targetValue: b.targetValue,
    unit: b.unit,
    startTime: b.startTime,
  }
  return withId ? { ...draft, id: b.id } : draft
}

function session(
  id: string,
  scheduleId: string | null,
  date: string,
  status: SessionStatus,
): Session {
  return {
    id,
    goalId: 'g1',
    userId: 'u1',
    scheduleId,
    date,
    targetKind: 'time',
    targetValue: 30,
    unit: null,
    plannedTime: null,
    startedAt: null,
    endedAt: null,
    actualValue: null,
    status,
    pausedAt: null,
    pausedTotalSeconds: 0,
    accomplishment: null,
    createdAt: '2026-10-01T00:00:00Z',
  }
}

const mon = block('mon', 0, 30, '19:00')
const wed = block('wed', 2, 30, '19:00')
const fri = block('fri', 4, 30, '19:00')
const current = [mon, wed, fri]

describe('diffSchedule', () => {
  it('sin cambios → todo vacío', () => {
    expect(diffSchedule(current, current.map((b) => draftOf(b)))).toEqual({
      update: [],
      insert: [],
      remove: [],
    })
  })

  it('sin cambios y sin ids → todo vacío (empareja por día)', () => {
    expect(diffSchedule(current, current.map((b) => draftOf(b, false)))).toEqual({
      update: [],
      insert: [],
      remove: [],
    })
  })

  it('quitar el viernes → remove con el id del viernes', () => {
    const change = diffSchedule(current, [draftOf(mon), draftOf(wed)])
    expect(change).toEqual({ update: [], insert: [], remove: ['fri'] })
  })

  it('agregar el jueves → insert', () => {
    const thu = { ...draftOf(mon, false), weekday: 3 }
    const change = diffSchedule(current, [...current.map((b) => draftOf(b)), thu])
    expect(change).toEqual({ update: [], insert: [thu], remove: [] })
  })

  it('cambiar el valor del lunes → update conservando el id del lunes', () => {
    const desired = [{ ...draftOf(mon), targetValue: 45 }, draftOf(wed), draftOf(fri)]
    expect(diffSchedule(current, desired)).toEqual({
      update: [{ id: 'mon', targetKind: 'time', targetValue: 45, unit: null, startTime: '19:00' }],
      insert: [],
      remove: [],
    })
  })

  it('desired vacío → remove de todos los bloques', () => {
    expect(diffSchedule(current, [])).toEqual({
      update: [],
      insert: [],
      remove: ['mon', 'wed', 'fri'],
    })
  })

  it('dos momentos el lunes: cambia la hora de uno → ids estables y se actualiza el correcto', () => {
    const morning = block('mon-am', 0, 30, '08:00')
    const evening = block('mon-pm', 0, 30, '19:00')
    // El de la noche pasa a las 07:00: por id no se confunde con el de la mañana.
    const desired = [draftOf(morning), { ...draftOf(evening), startTime: '07:00' }]
    expect(diffSchedule([morning, evening], desired)).toEqual({
      update: [{ id: 'mon-pm', targetKind: 'time', targetValue: 30, unit: null, startTime: '07:00' }],
      insert: [],
      remove: [],
    })
  })

  it('drafts reconstruidos sin id reutilizan bloques por día y orden de hora', () => {
    const morning = block('mon-am', 0, 30, '08:00')
    const evening = block('mon-pm', 0, 30, '19:00')
    const tue = block('tue', 1, 30, '08:00')
    // Modo "mismo horario": el valor sube a 40 en todos y se pierde el id.
    const desired = [morning, evening, tue].map((b) => ({ ...draftOf(b, false), targetValue: 40 }))
    const change = diffSchedule([evening, tue, morning], desired)
    expect(change.insert).toEqual([])
    expect(change.remove).toEqual([])
    expect(change.update).toEqual([
      { id: 'mon-am', targetKind: 'time', targetValue: 40, unit: null, startTime: '08:00' },
      { id: 'mon-pm', targetKind: 'time', targetValue: 40, unit: null, startTime: '19:00' },
      { id: 'tue', targetKind: 'time', targetValue: 40, unit: null, startTime: '08:00' },
    ])
  })

  it('sin hora va después de las horas y empata por createdAt', () => {
    const a = block('a', 0, 30, null, '2026-10-01T00:00:00Z')
    const b = block('b', 0, 30, null, '2026-10-02T00:00:00Z')
    const c = block('c', 0, 30, '10:00', '2026-10-03T00:00:00Z')
    const desired: CommitmentBlockDraft[] = [
      { ...draftOf(c, false), targetValue: 10 },
      { ...draftOf(a, false), targetValue: 20 },
      { ...draftOf(b, false), targetValue: 25 },
    ]
    expect(diffSchedule([b, c, a], desired).update).toEqual([
      { id: 'c', targetKind: 'time', targetValue: 10, unit: null, startTime: '10:00' },
      { id: 'a', targetKind: 'time', targetValue: 20, unit: null, startTime: null },
      { id: 'b', targetKind: 'time', targetValue: 25, unit: null, startTime: null },
    ])
  })

  it('un id que no existe se trata como draft sin id', () => {
    const desired = [{ ...draftOf(mon), id: 'fantasma' }]
    expect(diffSchedule([mon], desired)).toEqual({ update: [], insert: [], remove: [] })
  })

  it('un momento extra sin id el mismo día → insert; el resto se conserva', () => {
    const extra: CommitmentBlockDraft = { ...draftOf(mon, false), startTime: '07:00' }
    const change = diffSchedule([mon], [draftOf(mon), extra])
    expect(change).toEqual({ update: [], insert: [extra], remove: [] })
  })
})

describe('editBlockValue', () => {
  it("'this' cambia solo el bloque tocado y conserva los ids", () => {
    const drafts = editBlockValue(current, 'wed', { targetValue: 50, startTime: '07:00' }, 'this')
    expect(drafts).toEqual([
      draftOf(mon),
      { ...draftOf(wed), targetValue: 50, startTime: '07:00' },
      draftOf(fri),
    ])
  })

  it("'all' aplica el valor a todos los bloques de la meta", () => {
    const drafts = editBlockValue(current, 'wed', { targetValue: 50 }, 'all')
    expect(drafts.map((d) => [d.id, d.targetValue])).toEqual([
      ['mon', 50],
      ['wed', 50],
      ['fri', 50],
    ])
  })

  it("'all' con hora solo toca bloques con la misma hora original del tocado", () => {
    const monAm = block('mon-am', 0, 30, '08:00')
    const monPm = block('mon-pm', 0, 30, '19:00')
    const tueAm = block('tue-am', 1, 30, '08:00')
    const tuePm = block('tue-pm', 1, 30, '19:00')
    const drafts = editBlockValue([monAm, monPm, tueAm, tuePm], 'mon-pm', { startTime: '20:00' }, 'all')
    expect(drafts.map((d) => [d.id, d.startTime])).toEqual([
      ['mon-am', '08:00'],
      ['mon-pm', '20:00'],
      ['tue-am', '08:00'],
      ['tue-pm', '20:00'],
    ])
  })

  it('el resultado alimenta diffSchedule como update del mismo id', () => {
    const drafts = editBlockValue(current, 'mon', { targetValue: 45 }, 'this')
    expect(diffSchedule(current, drafts).update.map((u) => u.id)).toEqual(['mon'])
  })
})

describe('editBlockDays', () => {
  it('el jueves nuevo hereda hora 19:00 y 45 min del lunes tocado', () => {
    const monday = block('mon', 0, 45, '19:00')
    const drafts = editBlockDays([monday, block('wed', 2, 30, '08:00')], 'mon', [0, 2, 3])
    expect(drafts).toEqual([
      draftOf(monday),
      draftOf(block('wed', 2, 30, '08:00')),
      { weekday: 3, targetKind: 'time', targetValue: 45, unit: null, startTime: '19:00' },
    ])
  })

  it('quitar un día con dos momentos borra ambos; los días que quedan conservan todo', () => {
    const monAm = block('mon-am', 0, 30, '08:00')
    const monPm = block('mon-pm', 0, 30, '19:00')
    const tueAm = block('tue-am', 1, 30, '08:00')
    const tuePm = block('tue-pm', 1, 30, '19:00')
    const all = [monAm, monPm, tueAm, tuePm]
    const drafts = editBlockDays(all, 'tue-pm', [1])
    expect(drafts.map((d) => d.id)).toEqual(['tue-am', 'tue-pm'])
    expect(diffSchedule(all, drafts)).toEqual({ update: [], insert: [], remove: ['mon-am', 'mon-pm'] })
  })

  it('cada día nuevo recibe UNA copia del bloque tocado, aunque su día tenga dos momentos', () => {
    const monAm = block('mon-am', 0, 30, '08:00')
    const monPm = block('mon-pm', 0, 60, '19:00')
    const drafts = editBlockDays([monAm, monPm], 'mon-pm', [0, 4])
    expect(drafts).toEqual([
      draftOf(monAm),
      draftOf(monPm),
      { weekday: 4, targetKind: 'time', targetValue: 60, unit: null, startTime: '19:00' },
    ])
  })
})

describe('sessionsToSync', () => {
  const today = '2026-10-28'
  const change: ScheduleChange = {
    update: [{ id: 'mon', targetKind: 'time', targetValue: 45, unit: null, startTime: '07:00' }],
    insert: [],
    remove: ['fri'],
  }
  // Estado actual: el lunes sin hora (el cambio le pone las 07:00).
  const current = [block('mon', 0, 30, null), block('fri', 4, 30, null)]

  it('pending de hoy de un bloque removido → delete', () => {
    expect(sessionsToSync(change, current, [session('s1', 'fri', today, 'pending')], today)).toEqual({
      deleteIds: ['s1'],
      update: [],
    })
  })

  it('running de hoy de un bloque removido → intacta', () => {
    expect(sessionsToSync(change, current, [session('s1', 'fri', today, 'running')], today)).toEqual({
      deleteIds: [],
      update: [],
    })
  })

  it('pending de ayer → intacta', () => {
    const sessions = [session('s1', 'fri', '2026-10-27', 'pending'), session('s2', 'mon', '2026-10-27', 'pending')]
    expect(sessionsToSync(change, current, sessions, today)).toEqual({ deleteIds: [], update: [] })
  })

  it('skipped de mañana de un bloque removido → delete', () => {
    expect(sessionsToSync(change, current, [session('s1', 'fri', '2026-10-29', 'skipped')], today)).toEqual({
      deleteIds: ['s1'],
      update: [],
    })
  })

  it('pending de hoy de un bloque actualizado → update de valor y hora', () => {
    expect(sessionsToSync(change, current, [session('s1', 'mon', today, 'pending')], today)).toEqual({
      deleteIds: [],
      update: [{ id: 's1', targetKind: 'time', targetValue: 45, unit: null, plannedTime: '07:00' }],
    })
  })

  it('si la hora del bloque no cambió, no pisa la hora propia de la sesión (Reorganizar)', () => {
    const onlyValue: ScheduleChange = {
      update: [{ id: 'mon', targetKind: 'time', targetValue: 45, unit: null, startTime: '07:00' }],
      insert: [],
      remove: [],
    }
    const sameTime = [block('mon', 0, 30, '07:00')]
    const result = sessionsToSync(onlyValue, sameTime, [session('s1', 'mon', today, 'pending')], today)
    expect(result.update).toEqual([{ id: 's1', targetKind: 'time', targetValue: 45, unit: null }])
    expect('plannedTime' in result.update[0]).toBe(false)
  })

  it('cambio de medida (30 min → 3 km) → la sesión pendiente cambia tipo, valor y unidad', () => {
    const km: ScheduleChange = {
      update: [{ id: 'mon', targetKind: 'count', targetValue: 3, unit: 'km', startTime: '07:00' }],
      insert: [],
      remove: [],
    }
    expect(sessionsToSync(km, current, [session('s1', 'mon', today, 'pending')], today)).toEqual({
      deleteIds: [],
      update: [{ id: 's1', targetKind: 'count', targetValue: 3, unit: 'km', plannedTime: '07:00' }],
    })
  })

  it('nunca toca done/partial/missed/unconfirmed ni sesiones espontáneas', () => {
    const sessions = [
      session('s1', 'fri', today, 'done'),
      session('s2', 'fri', today, 'partial'),
      session('s3', 'mon', today, 'missed'),
      session('s4', 'mon', today, 'unconfirmed'),
      session('s5', 'mon', today, 'skipped'),
      session('s6', null, today, 'pending'),
    ]
    expect(sessionsToSync(change, current, sessions, today)).toEqual({ deleteIds: [], update: [] })
  })
})
