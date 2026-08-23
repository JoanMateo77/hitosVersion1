import { describe, expect, it } from 'vitest'
import {
  WEEKDAY_LABELS,
  blockEndTime,
  blockTimeLabel,
  buildMilestonesFromTemplate,
  durationStep,
  expandMomentsToDays,
  formatCommitmentSummary,
  minutesToTime,
  momentsOfDay,
  overcommitWarning,
  preferredStartTime,
  rangeMinutes,
  timeToMinutes,
  uniformMoments,
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
  it('rechaza bloques con duración cero', () => {
    expect(
      validateCommitment([{ weekday: 0, targetKind: 'time', targetValue: 0, unit: null, startTime: null }]),
    ).toBe('Cada momento necesita una duración o cantidad mayor a cero.')
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
  it('avisa por cantidad de sesiones aunque no llegue a 90 min, sin "(0 min)"', () => {
    const countBlock = (weekday: number, idx: number): ScheduleBlock => ({
      id: `c-${weekday}-${idx}`,
      goalId: 'otra-meta',
      userId: 'u1',
      weekday,
      targetKind: 'count',
      targetValue: 10,
      unit: 'páginas',
      startTime: null,
      createdAt: '2026-06-01T00:00:00Z',
    })
    const msg = overcommitWarning([countBlock(0, 1), countBlock(0, 2), countBlock(0, 3)], [time(0, 25)])
    expect(msg).toBe('Los lunes ya tienes 3 sesiones de otras metas. Revisa que el plan te entre.')
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

describe('validateCommitment con cantidad', () => {
  it('exige unidad del catálogo en metas de cantidad', () => {
    const sinUnidad: CommitmentBlockDraft[] = [
      { weekday: 0, targetKind: 'count', targetValue: 10, unit: null, startTime: null },
    ]
    expect(validateCommitment(sinUnidad)).toMatch(/qué vas a medir/i)
    const conUnidad = sinUnidad.map((b) => ({ ...b, unit: 'páginas' }))
    expect(validateCommitment(conUnidad)).toBeNull()
  })
})

describe('horario por rangos (helpers de UI)', () => {
  it('convierte HH:MM a minutos y de vuelta, envolviendo medianoche', () => {
    expect(timeToMinutes('08:30')).toBe(510)
    expect(minutesToTime(510)).toBe('08:30')
    expect(minutesToTime(1500)).toBe('01:00')
  })

  it('deriva la hora de fin como inicio + duración', () => {
    expect(blockEndTime(time(0, 240, '08:00'))).toBe('12:00')
    expect(blockEndTime(time(0, 240))).toBeNull()
    expect(
      blockEndTime({ weekday: 0, targetKind: 'count', targetValue: 10, unit: 'km', startTime: '08:00' }),
    ).toBeNull()
  })

  it('calcula minutos entre inicio y fin, y rechaza rangos invertidos', () => {
    expect(rangeMinutes('08:00', '12:00')).toBe(240)
    expect(rangeMinutes('14:00', '17:00')).toBe(180)
    expect(rangeMinutes('12:00', '12:00')).toBeNull()
    expect(rangeMinutes('12:00', '08:00')).toBeNull()
  })

  it('etiqueta el bloque con rango, hora suelta o solo cantidad', () => {
    expect(blockTimeLabel(time(0, 240, '08:00'))).toBe('8:00 am–12:00 pm · 4 h')
    expect(blockTimeLabel(time(0, 25))).toBe('25 min')
    expect(
      blockTimeLabel({ weekday: 0, targetKind: 'count', targetValue: 10, unit: 'páginas', startTime: '19:00' }),
    ).toBe('7:00 pm · 10 páginas')
    expect(
      blockTimeLabel({ weekday: 0, targetKind: 'count', targetValue: 10, unit: null, startTime: null }),
    ).toBe('10')
  })

  it('mapea el momento preferido del perfil a la hora sugerida', () => {
    expect(preferredStartTime('morning')).toBe('08:00')
    expect(preferredStartTime('midday')).toBe('13:00')
    expect(preferredStartTime('evening')).toBe('19:00')
    expect(preferredStartTime('depends')).toBeNull()
    expect(preferredStartTime(null)).toBeNull()
  })

  it('el paso del stepper crece con la duración y baja simétrico', () => {
    expect(durationStep(25, 1)).toBe(5)
    expect(durationStep(60, 1)).toBe(15)
    expect(durationStep(120, 1)).toBe(30)
    expect(durationStep(60, -1)).toBe(5) // 60 → 55, no salta a 45
    expect(durationStep(120, -1)).toBe(15)
    expect(durationStep(150, -1)).toBe(30)
  })
})

describe('horario compartido entre días', () => {
  it('detecta cuando todos los días tienen los mismos momentos', () => {
    const shared = [time(0, 240, '08:00'), time(0, 180, '14:00'), time(2, 240, '08:00'), time(2, 180, '14:00')]
    expect(uniformMoments(shared)).toEqual([
      { targetKind: 'time', targetValue: 240, unit: null, startTime: '08:00' },
      { targetKind: 'time', targetValue: 180, unit: null, startTime: '14:00' },
    ])
  })

  it('devuelve null si algún día difiere o no hay bloques', () => {
    expect(uniformMoments([time(0, 240, '08:00'), time(2, 25, '08:00')])).toBeNull()
    expect(uniformMoments([])).toBeNull()
  })

  it('replica los momentos en cada día, ordenado por weekday', () => {
    const moments = [
      { targetKind: 'time' as const, targetValue: 240, unit: null, startTime: '08:00' },
      { targetKind: 'time' as const, targetValue: 180, unit: null, startTime: '14:00' },
    ]
    const expanded = expandMomentsToDays(moments, [4, 0])
    expect(expanded).toHaveLength(4)
    expect(expanded.map((b) => b.weekday)).toEqual([0, 0, 4, 4])
    expect(uniformMoments(expanded)).toEqual(moments)
  })

  it('extrae los momentos de un día sin el weekday', () => {
    const blocks = [time(0, 240, '08:00'), time(3, 25)]
    expect(momentsOfDay(blocks, 0)).toEqual([
      { targetKind: 'time', targetValue: 240, unit: null, startTime: '08:00' },
    ])
    expect(momentsOfDay(blocks, 5)).toEqual([])
  })
})
