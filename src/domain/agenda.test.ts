import { describe, expect, it } from 'vitest'
import {
  assignEventsToSessions,
  eventSpan,
  freeGaps,
  gapLabel,
  gridBounds,
  layoutDay,
  rangeLabel,
  sessionSpan,
  uncoveredGaps,
  type AgendaSessionSlot,
} from '@/domain/agenda'
import type { CalendarEvent } from '@/lib/types'

function ev(over: Partial<CalendarEvent> = {}): CalendarEvent {
  return {
    id: 'e1',
    userId: 'u1',
    goalId: null,
    title: 'Algo',
    notes: null,
    date: '2026-06-08',
    startTime: null,
    endTime: null,
    allDay: false,
    doneAt: null,
    createdAt: '2026-06-01T00:00:00Z',
    ...over,
  }
}

function slot(over: Partial<AgendaSessionSlot> = {}): AgendaSessionSlot {
  return { key: 's1', goalId: 'g1', start: '08:00', end: '10:00', ...over }
}

describe('sessionSpan', () => {
  it('deriva el fin solo para compromisos de tiempo con hora', () => {
    expect(sessionSpan('08:00', 'time', 120)).toEqual({ start: '08:00', end: '10:00' })
    expect(sessionSpan('08:00', 'count', 10)).toEqual({ start: '08:00', end: null })
    expect(sessionSpan(null, 'time', 120)).toEqual({ start: null, end: null })
  })
  it('si el fin cruza medianoche queda null (no rompe los huecos)', () => {
    expect(sessionSpan('23:00', 'time', 120)).toEqual({ start: '23:00', end: null })
  })
})

describe('eventSpan', () => {
  it('día completo o sin hora → null/null', () => {
    expect(eventSpan(ev({ allDay: true, startTime: '08:00', endTime: '09:00' }))).toEqual({
      start: null,
      end: null,
    })
    expect(eventSpan(ev({ startTime: null }))).toEqual({ start: null, end: null })
  })
  it('fin que no queda después del inicio se descarta', () => {
    expect(eventSpan(ev({ startTime: '10:00', endTime: '09:00' }))).toEqual({
      start: '10:00',
      end: null,
    })
    expect(eventSpan(ev({ startTime: '10:00', endTime: '12:00' }))).toEqual({
      start: '10:00',
      end: '12:00',
    })
  })
})

describe('assignEventsToSessions', () => {
  it('anida por ventana: gana la sesión cuyo [inicio, fin) contiene la hora del evento', () => {
    const sessions = [
      slot({ key: 'manana', start: '08:00', end: '10:00' }),
      slot({ key: 'tarde', start: '14:00', end: '16:00' }),
    ]
    const e = ev({ goalId: 'g1', startTime: '14:30' })
    const { nested, standalone } = assignEventsToSessions(sessions, [e])
    expect(nested.get('tarde')).toEqual([e])
    expect(nested.has('manana')).toBe(false)
    expect(standalone).toEqual([])
  })
  it('el límite es semiabierto: la hora exacta de fin ya no pertenece a la sesión', () => {
    const sessions = [
      slot({ key: 'manana', start: '08:00', end: '10:00' }),
      slot({ key: 'tarde', start: '10:00', end: '12:00' }),
    ]
    const e = ev({ goalId: 'g1', startTime: '10:00' })
    const { nested } = assignEventsToSessions(sessions, [e])
    expect(nested.get('tarde')).toEqual([e])
  })
  it('sin hora va a la primera sesión de su meta', () => {
    const sessions = [
      slot({ key: 'manana', start: '08:00', end: '10:00' }),
      slot({ key: 'tarde', start: '14:00', end: '16:00' }),
    ]
    const sinHora = ev({ id: 'a', goalId: 'g1', allDay: true })
    const { nested } = assignEventsToSessions(sessions, [sinHora])
    expect(nested.get('manana')?.map((x) => x.id)).toEqual(['a'])
  })
  it('cerca de la ventana (hasta 1 h de distancia) también se anida', () => {
    const sessions = [slot({ key: 'noche', start: '20:00', end: '22:00' })]
    const antes = ev({ id: 'a', goalId: 'g1', startTime: '19:30' })
    const despues = ev({ id: 'b', goalId: 'g1', startTime: '22:45' })
    const { nested, standalone } = assignEventsToSessions(sessions, [antes, despues])
    expect(nested.get('noche')?.map((x) => x.id)).toEqual(['a', 'b'])
    expect(standalone).toEqual([])
  })
  it('lejos de toda ventana queda suelto: anidarlo lo escondería a otra hora', () => {
    const sessions = [slot({ key: 'noche', start: '20:00', end: '22:00' })]
    const manana = ev({ id: 'a', goalId: 'g1', startTime: '09:00' })
    const { nested, standalone } = assignEventsToSessions(sessions, [manana])
    expect(nested.size).toBe(0)
    expect(standalone.map((x) => x.id)).toEqual(['a'])
  })
  it('si la meta solo tiene sesiones sin hora, el evento con hora se anida igual', () => {
    const sessions = [slot({ key: 'libre', start: null, end: null })]
    const conHora = ev({ id: 'a', goalId: 'g1', startTime: '09:00' })
    const { nested } = assignEventsToSessions(sessions, [conHora])
    expect(nested.get('libre')?.map((x) => x.id)).toEqual(['a'])
  })
  it('evento de una meta sin sesión ese día, o sin meta, queda suelto', () => {
    const sessions = [slot({ goalId: 'g1' })]
    const otraMeta = ev({ id: 'a', goalId: 'g2', startTime: '08:30' })
    const sinMeta = ev({ id: 'b', startTime: '09:00' })
    const { nested, standalone } = assignEventsToSessions(sessions, [otraMeta, sinMeta])
    expect(standalone.map((x) => x.id)).toEqual(['a', 'b'])
    expect(nested.size).toBe(0)
  })
  it('dentro del bloque ordena por hora, sin hora al final y empata por createdAt', () => {
    const sessions = [slot()]
    const tarde = ev({ id: 'tarde', goalId: 'g1', startTime: '09:30' })
    const sinHora2 = ev({
      id: 'sin2',
      goalId: 'g1',
      allDay: true,
      createdAt: '2026-06-02T00:00:00Z',
    })
    const sinHora1 = ev({
      id: 'sin1',
      goalId: 'g1',
      allDay: true,
      createdAt: '2026-06-01T00:00:00Z',
    })
    const temprano = ev({ id: 'temprano', goalId: 'g1', startTime: '08:15' })
    const { nested } = assignEventsToSessions(sessions, [tarde, sinHora2, sinHora1, temprano])
    expect(nested.get('s1')?.map((x) => x.id)).toEqual(['temprano', 'tarde', 'sin1', 'sin2'])
  })
})

describe('freeGaps', () => {
  it('solo reporta huecos de 45 min o más, antes del ítem correspondiente', () => {
    const items = [
      { start: '08:00', end: '09:00' },
      { start: '10:00', end: '10:30' }, // 60 min tras el fin del anterior
      { start: '11:00', end: null }, // 30 min: no llega
    ]
    expect(freeGaps(items)).toEqual(new Map([[1, 60]]))
  })
  it('sin fin, el hueco se mide desde el inicio del ítem anterior', () => {
    const items = [
      { start: '08:00', end: null },
      { start: '09:00', end: null },
    ]
    expect(freeGaps(items)).toEqual(new Map([[1, 60]]))
  })
  it('un solape no genera hueco', () => {
    const items = [
      { start: '08:00', end: '10:00' },
      { start: '09:30', end: '11:00' },
      { start: '12:00', end: null }, // 60 min tras las 11:00
    ]
    expect(freeGaps(items)).toEqual(new Map([[2, 60]]))
  })
})

describe('rangeLabel', () => {
  it('con fin: rango en 12 horas con endash sin espacios', () => {
    expect(rangeLabel('20:00', '22:00')).toBe('8:00 pm–10:00 pm')
  })
  it('sin fin: solo la hora de inicio', () => {
    expect(rangeLabel('20:00', null)).toBe('8:00 pm')
  })
})

describe('gridBounds', () => {
  it('sin ítems con hora (o todos dentro) usa la ventana 07:00–21:00', () => {
    expect(gridBounds([])).toEqual({ startMin: 420, endMin: 1260 })
    expect(gridBounds([{ start: '08:00', end: '10:00' }])).toEqual({ startMin: 420, endMin: 1260 })
    expect(gridBounds([{ start: null, end: null }])).toEqual({ startMin: 420, endMin: 1260 })
  })
  it('se expande redondeando a la hora para abarcar los ítems', () => {
    expect(gridBounds([{ start: '06:30', end: '07:30' }]).startMin).toBe(360)
    expect(gridBounds([{ start: '20:00', end: '22:10' }]).endMin).toBe(1380)
  })
  it('un ítem sin fin cuenta como inicio + 30 min', () => {
    expect(gridBounds([{ start: '21:00', end: null }]).endMin).toBe(1320)
    expect(gridBounds([{ start: '20:30', end: null }]).endMin).toBe(1260)
  })
  it('clampa a los límites del día', () => {
    expect(gridBounds([{ start: '23:45', end: null }]).endMin).toBe(1440)
  })
})

describe('layoutDay', () => {
  it('ítems que no se tocan van todos al carril 0 con lanes 1', () => {
    const out = layoutDay([
      { key: 'a', start: '08:00', end: '09:00' },
      { key: 'b', start: '09:00', end: '10:00' },
    ])
    expect(out).toEqual([
      { key: 'a', startMin: 480, endMin: 540, lane: 0, lanes: 1 },
      { key: 'b', startMin: 540, endMin: 600, lane: 0, lanes: 1 },
    ])
  })
  it('solape → carriles repartidos con el total del clúster', () => {
    const byKey = new Map(
      layoutDay([
        { key: 'a', start: '08:00', end: '10:00' },
        { key: 'b', start: '08:30', end: '09:30' },
      ]).map((p) => [p.key, p]),
    )
    expect(byKey.get('a')).toMatchObject({ lane: 0, lanes: 2 })
    expect(byKey.get('b')).toMatchObject({ lane: 1, lanes: 2 })
  })
  it('un clúster aparte resetea lanes', () => {
    const byKey = new Map(
      layoutDay([
        { key: 'a', start: '08:00', end: '09:00' },
        { key: 'b', start: '08:00', end: '09:00' },
        { key: 'c', start: '12:00', end: '13:00' },
      ]).map((p) => [p.key, p]),
    )
    expect(byKey.get('a')?.lanes).toBe(2)
    expect(byKey.get('c')).toMatchObject({ lane: 0, lanes: 1 })
  })
  it('ítems puntuales ocupan 30 min visuales (y por eso chocan)', () => {
    const byKey = new Map(
      layoutDay([
        { key: 'a', start: '08:00', end: null },
        { key: 'b', start: '08:15', end: null },
      ]).map((p) => [p.key, p]),
    )
    expect(byKey.get('a')).toMatchObject({ startMin: 480, endMin: 510, lanes: 2 })
    expect(byKey.get('b')).toMatchObject({ startMin: 495, endMin: 525, lane: 1 })
  })
  it('empate de inicio: el más largo toma el primer carril', () => {
    const byKey = new Map(
      layoutDay([
        { key: 'corto', start: '08:00', end: '09:00' },
        { key: 'largo', start: '08:00', end: '11:00' },
      ]).map((p) => [p.key, p]),
    )
    expect(byKey.get('largo')?.lane).toBe(0)
    expect(byKey.get('corto')?.lane).toBe(1)
  })
  it('un carril liberado se reusa dentro del clúster', () => {
    const byKey = new Map(
      layoutDay([
        { key: 'a', start: '08:00', end: '09:00' },
        { key: 'b', start: '08:00', end: '10:00' },
        { key: 'c', start: '09:00', end: '09:30' },
      ]).map((p) => [p.key, p]),
    )
    // b es más largo → carril 0; a queda en el 1 y c reusa el 1 al liberarse.
    expect(byKey.get('b')).toMatchObject({ lane: 0, lanes: 2 })
    expect(byKey.get('c')).toMatchObject({ lane: 1, lanes: 2 })
  })
})

describe('uncoveredGaps', () => {
  const bounds = { startMin: 420, endMin: 1260 }
  it('sin ítems, toda la ventana es un hueco', () => {
    expect(uncoveredGaps([], bounds)).toEqual([{ startMin: 420, endMin: 1260 }])
  })
  it('fusiona cobertura solapada y reporta el tramo inicial y el final', () => {
    const gaps = uncoveredGaps(
      [
        { start: '08:30', end: '10:00' },
        { start: '08:00', end: '09:00' },
      ],
      bounds,
    )
    expect(gaps).toEqual([
      { startMin: 420, endMin: 480 },
      { startMin: 600, endMin: 1260 },
    ])
  })
  it('huecos menores a 60 min no cuentan', () => {
    const gaps = uncoveredGaps(
      [
        { start: '07:00', end: '12:00' },
        { start: '12:45', end: '21:00' },
      ],
      bounds,
    )
    expect(gaps).toEqual([])
  })
  it('un ítem puntual cubre 30 min efectivos', () => {
    expect(uncoveredGaps([{ start: '12:00', end: null }], bounds)).toEqual([
      { startMin: 420, endMin: 720 },
      { startMin: 750, endMin: 1260 },
    ])
  })
  it('cobertura fuera de la ventana no la achica', () => {
    expect(uncoveredGaps([{ start: '06:00', end: '07:00' }], bounds)).toEqual([
      { startMin: 420, endMin: 1260 },
    ])
  })
})

describe('gapLabel', () => {
  it('bajo 2 horas usa los minutos exactos', () => {
    expect(gapLabel(45)).toBe('45 min libre')
    expect(gapLabel(100)).toBe('1 h 40 min libre')
  })
  it('desde 2 horas redondea a horas/medias', () => {
    expect(gapLabel(130)).toBe('2 h libre')
    expect(gapLabel(145)).toBe('2 h 30 min libre')
  })
})
