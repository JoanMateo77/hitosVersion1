import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_LABELS,
  buildMilestonesFromTemplate,
  formatCommitmentSummary,
  overcommitWarning,
  validateCommitment,
  weekdayMon0,
  weekdaysForCadence,
  weeklyTotal,
  type CommitmentBlockDraft,
} from '@/domain/commitment'
import type { ScheduleBlock } from '@/lib/types'
import { formatDuration } from '@/lib/date'
import { getTemplate } from '@/domain/templates'

const time = (weekday: number, minutes: number, startTime: string | null = null): CommitmentBlockDraft => ({
  weekday,
  targetKind: 'time',
  targetValue: minutes,
  unit: null,
  startTime,
})

describe('weekdayMon0', () => {
  it('convierte getDay() (domingo=0) a lunes=0', () => {
    expect(weekdayMon0('2026-06-08')).toBe(0) // lunes
    expect(weekdayMon0('2026-06-14')).toBe(6) // domingo
  })
})

describe('weeklyTotal', () => {
  it('suma sesiones y minutos de bloques de tiempo', () => {
    const blocks = [time(0, 25), time(4, 30, '10:00'), time(4, 30, '14:00')]
    expect(weeklyTotal(blocks)).toEqual({ sessions: 3, minutes: 85 })
  })
  it('cuenta sesiones de cantidad pero no suma minutos', () => {
    const blocks: CommitmentBlockDraft[] = [
      { weekday: 1, targetKind: 'count', targetValue: 10, unit: 'páginas', startTime: null },
      time(2, 25),
    ]
    expect(weeklyTotal(blocks)).toEqual({ sessions: 2, minutes: 25 })
  })
})

describe('formatCommitmentSummary', () => {
  it('resume sesiones y tiempo semanal', () => {
    // El formato del tiempo lo define formatDuration (lib/date): no lo duplicamos.
    expect(formatCommitmentSummary([time(0, 25), time(2, 25), time(4, 45)])).toBe(
      `Tu compromiso: 3 sesiones · ${formatDuration(95)} por semana`,
    )
  })
  it('sin minutos (solo cantidad) omite el tiempo', () => {
    const blocks: CommitmentBlockDraft[] = [
      { weekday: 0, targetKind: 'count', targetValue: 10, unit: 'páginas', startTime: null },
    ]
    expect(formatCommitmentSummary(blocks)).toBe('Tu compromiso: 1 sesión por semana')
  })
})

describe('validateCommitment', () => {
  it('exige al menos un bloque', () => {
    expect(validateCommitment([])).toBe('Elige al menos un día para tu compromiso.')
  })
  it('acepta un compromiso válido', () => {
    expect(validateCommitment([time(0, 25)])).toBeNull()
  })
})

describe('overcommitWarning', () => {
  const existing = (weekday: number, minutes: number): ScheduleBlock => ({
    id: `e-${weekday}-${minutes}`,
    goalId: 'otra-meta',
    userId: 'u1',
    weekday,
    targetKind: 'time',
    targetValue: minutes,
    unit: null,
    startTime: null,
    createdAt: '2026-06-01T00:00:00Z',
  })

  it('avisa cuando un día elegido ya acumula 90 min o más de otras metas', () => {
    const msg = overcommitWarning([existing(0, 60), existing(0, 45)], [time(0, 25)])
    expect(msg).toBe(
      `Los lunes ya tienes 2 sesiones (${formatDuration(105)}) de otras metas. Revisa que el plan te entre.`,
    )
  })
  it('no avisa si los días elegidos están libres', () => {
    expect(overcommitWarning([existing(1, 120)], [time(0, 25)])).toBeNull()
  })
})

describe('buildMilestonesFromTemplate', () => {
  it('copia los hitos de la plantilla marcando los primeros N como cumplidos', () => {
    const template = getTemplate('salud_fisico')
    const drafts = buildMilestonesFromTemplate(template, 2)
    expect(drafts).toHaveLength(template.milestones.length)
    expect(drafts[0]).toEqual({ title: template.milestones[0], position: 0, targetDate: null, done: true })
    expect(drafts[2].done).toBe(false)
  })
})

describe('weekdaysForCadence', () => {
  it('mapea cada cadencia legacy a días lunes=0', () => {
    expect(weekdaysForCadence('daily')).toEqual([0, 1, 2, 3, 4, 5, 6])
    expect(weekdaysForCadence('weekdays')).toEqual([0, 1, 2, 3, 4])
    expect(weekdaysForCadence('thrice_week')).toEqual([0, 2, 4])
    expect(weekdaysForCadence('weekly')).toEqual([0])
  })
})

describe('WEEKDAY_LABELS', () => {
  it('arranca en lunes', () => {
    expect(WEEKDAY_LABELS[0]).toBe('Lu')
    expect(WEEKDAY_LABELS[6]).toBe('Do')
  })
})
