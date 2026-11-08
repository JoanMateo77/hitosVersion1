import { describe, expect, it } from 'vitest'
import { createTourState, IA_TOUR } from '@/components/tour/tourState'

/** Storage en memoria con la misma interfaz que localStorage/sessionStorage. */
function memory(): Storage {
  const data = new Map<string, string>()
  return {
    get length() {
      return data.size
    },
    clear: () => data.clear(),
    getItem: (k) => data.get(k) ?? null,
    key: (i) => [...data.keys()][i] ?? null,
    removeItem: (k) => void data.delete(k),
    setItem: (k, v) => void data.set(k, String(v)),
  }
}

const make = (done = memory(), progress = memory()) => ({ done, progress, tour: createTourState(IA_TOUR, done, progress) })

describe('tour state', () => {
  it('starts at the first step for someone who never saw it', () => {
    const { tour } = make()
    expect(tour.current()?.target).toBe('ia-entry')
  })

  it('advances step by step and ends after the last one', () => {
    const { tour } = make()
    const seen = [tour.current()?.target]
    while (tour.current()) {
      tour.next()
      seen.push(tour.current()?.target)
    }
    expect(seen).toEqual(['ia-entry', 'ia-composer', 'ia-apply', undefined])
  })

  it('finishing or skipping is remembered on this device', () => {
    const { done, progress, tour } = make()
    tour.finish()
    expect(tour.current()).toBeNull()
    expect(createTourState(IA_TOUR, done, progress).current()).toBeNull()
  })

  it('keeps the step when the screen changes (Hoy → Agenda)', () => {
    const { done, progress, tour } = make()
    tour.next()
    expect(createTourState(IA_TOUR, done, progress).current()?.target).toBe('ia-composer')
  })

  it('"¿Cómo funciona?" replays from a given step even after finishing', () => {
    const { tour } = make()
    tour.finish()
    tour.start('ia-composer')
    expect(tour.current()?.target).toBe('ia-composer')
  })

  it('notifies subscribers on every change', () => {
    const { tour } = make()
    let calls = 0
    const off = tour.subscribe(() => calls++)
    tour.next()
    tour.finish()
    off()
    tour.start('ia-entry')
    expect(calls).toBe(2)
  })

  it('a corrupted saved step falls back to the first one', () => {
    const progress = memory()
    progress.setItem(`${IA_TOUR.id}.step`, 'banana')
    expect(createTourState(IA_TOUR, memory(), progress).current()?.target).toBe('ia-entry')
  })
})
