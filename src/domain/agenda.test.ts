import { describe, expect, it } from 'vitest'
import {
  assignEventsToSessions,
  defaultOpenBlock,
  eventSpan,
  freeGaps,
  gapLabel,
  groupIntoBlocks,
  nowLineIndex,
  periodOf,
  periodOfMinutes,
  PERIOD_LABELS,
  PERIOD_ORDER,
  rangeLabel,
  sessionSpan,
  type AgendaSessionSlot,
  type DayItemSpan,
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

function span(over: Partial<DayItemSpan> = {}): DayItemSpan {
  return { key: 'a', start: '08:00', end: '09:00', ...over }
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

describe('periodOf', () => {
  it('11:59 es mañana, 12:00 tarde, 18:59 tarde, 19:00 noche', () => {
    expect(periodOf('11:59')).toBe('morning')
    expect(periodOf('12:00')).toBe('afternoon')
    expect(periodOf('18:59')).toBe('afternoon')
    expect(periodOf('19:00')).toBe('evening')
    expect(periodOfMinutes(0)).toBe('morning')
  })
  it('las etiquetas y el orden son Mañana · Tarde · Noche', () => {
    expect(PERIOD_ORDER.map((p) => PERIOD_LABELS[p])).toEqual(['Mañana', 'Tarde', 'Noche'])
  })
})

describe('defaultOpenBlock / nowLineIndex', () => {
  const blocks = groupIntoBlocks([
    span({ key: 'a', start: '08:00', end: '09:00' }),
    span({ key: 'b', start: '14:00', end: '15:00' }),
  ])
  it('dentro de un bloque: abre ese bloque y la línea va después de él', () => {
    expect(defaultOpenBlock(blocks, 8 * 60 + 30)).toBe('b-08:00')
    expect(nowLineIndex(blocks, 8 * 60 + 30)).toBe(1)
  })
  it('entre bloques: abre el próximo y la línea va antes de él', () => {
    expect(defaultOpenBlock(blocks, 10 * 60)).toBe('b-14:00')
    expect(nowLineIndex(blocks, 10 * 60)).toBe(1)
  })
  it('antes del primero: abre el primero, línea al índice 0', () => {
    expect(defaultOpenBlock(blocks, 6 * 60)).toBe('b-08:00')
    expect(nowLineIndex(blocks, 6 * 60)).toBe(0)
  })
  it('después del último: nada abierto, línea al final', () => {
    expect(defaultOpenBlock(blocks, 20 * 60)).toBeNull()
    expect(nowLineIndex(blocks, 20 * 60)).toBe(2)
  })
  it('sin bloques: null y 0', () => {
    expect(defaultOpenBlock([], 600)).toBeNull()
    expect(nowLineIndex([], 600)).toBe(0)
  })
})

describe('freeGaps con umbral', () => {
  it('con minMinutes 60 ignora huecos de 45 min y reporta los de 60', () => {
    const gaps = freeGaps(
      [
        { start: '08:00', end: '09:00' },
        { start: '09:45', end: '10:00' },
        { start: '11:00', end: '12:00' },
      ],
      60,
    )
    expect([...gaps.entries()]).toEqual([[2, 60]])
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

describe('groupIntoBlocks', () => {
  it('lista vacía → sin bloques', () => {
    expect(groupIntoBlocks([])).toEqual([])
  })

  it('ítems que no se tocan → un bloque por ítem, ordenados por inicio', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'b', start: '10:00', end: '11:00' }),
      span({ key: 'a', start: '08:00', end: '09:00' }),
    ])
    expect(blocks.map((b) => b.items.map((i) => i.key))).toEqual([['a'], ['b']])
    expect(blocks[0]).toMatchObject({ key: 'b-08:00', start: '08:00', end: '09:00', startMin: 480, endMin: 540 })
  })

  it('solape parcial → un bloque con rango real y fin efectivo máximo', () => {
    const [b] = groupIntoBlocks([
      span({ key: 'a', start: '08:00', end: '08:45' }),
      span({ key: 'h', start: '08:00', end: null }),
      span({ key: 'c', start: '08:30', end: '09:30' }),
    ])
    expect(b.items.map((i) => i.key)).toEqual(['a', 'h', 'c'])
    expect(b.end).toBe('09:30')
    expect(b.endMin).toBe(570)
  })

  it('ítems que se tocan (fin == inicio) NO se unen', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'a', start: '08:00', end: '08:30' }),
      span({ key: 'b', start: '08:30', end: '09:00' }),
    ])
    expect(blocks).toHaveLength(2)
  })

  it('un ítem puntual cubre 30 min efectivos y por eso absorbe lo que empieza dentro', () => {
    const blocks = groupIntoBlocks([
      span({ key: 'h', start: '20:00', end: null }),
      span({ key: 'e', start: '20:15', end: '20:45' }),
    ])
    expect(blocks).toHaveLength(1)
    expect(blocks[0].end).toBe('20:45')
  })

  it('si ningún ítem tiene fin, el fin real del bloque es null pero el efectivo es inicio + 30', () => {
    const [b] = groupIntoBlocks([span({ key: 'h', start: '07:00', end: null })])
    expect(b.end).toBeNull()
    expect(b.endMin).toBe(450)
  })

  it('empate de inicio: el más largo va primero; luego por clave', () => {
    const [b] = groupIntoBlocks([
      span({ key: 'corto', start: '08:00', end: '08:15' }),
      span({ key: 'largo', start: '08:00', end: '09:00' }),
      span({ key: 'sin-fin', start: '08:00', end: null }),
    ])
    // largo: fin 09:00; corto y sin-fin: fin efectivo 08:30 (empate) → por clave
    expect(b.items.map((i) => i.key)).toEqual(['largo', 'corto', 'sin-fin'])
  })
})
