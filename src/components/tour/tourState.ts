/**
 * Estado de un tour guiado: en qué paso va y si ya se terminó. Terminar o
 * saltar se guarda en localStorage (no vuelve a salir en este dispositivo); el
 * paso en curso, en sessionStorage, para seguir al pasar de Hoy a la Agenda.
 * Spec: docs/superpowers/specs/2026-11-08-color-area-y-tour-ia-design.md §2
 */

export interface TourStep {
  /** Valor de `data-tour` del elemento que señala. */
  target: string
  title: string
  body: string
  /** El paso avanza al tocar el elemento señalado (no muestra "Siguiente"). */
  advanceOnTargetClick?: boolean
  /** La persona va a escribir aquí: el globo no le quita el foco. */
  typing?: boolean
}

export interface Tour {
  id: string
  steps: readonly TourStep[]
}

export const IA_TOUR: Tour = {
  id: 'logralo.tour.organizar-ia',
  steps: [
    {
      target: 'ia-entry',
      title: 'Organiza tu día con IA',
      body: 'Toca aquí y cuéntale lo que tienes pendiente. La IA lo acomoda en tu día sin choques.',
      advanceOnTargetClick: true,
    },
    {
      target: 'ia-composer',
      title: 'Cuéntale tu día con tus palabras',
      body: 'Escribe qué tienes que hacer y, si lo sabes, cuánto dura. O toca un ejemplo para probar.',
      typing: true,
    },
    {
      target: 'ia-apply',
      title: 'Revisa y aplica',
      body: 'Si falta algo, la IA te pregunta y respondes con un toque. Nada se guarda hasta Aplicar, y puedes deshacer.',
    },
  ],
}

export interface TourState {
  current(): TourStep | null
  /** Posición del paso actual (0…n-1), o null si no hay tour activo. */
  index(): number | null
  next(): void
  finish(): void
  /** Arranca (o repite) desde el paso con ese target. */
  start(target: string): void
  subscribe(fn: () => void): () => void
}

export function createTourState(tour: Tour, done: Storage, progress: Storage): TourState {
  const doneKey = tour.id
  const stepKey = `${tour.id}.step`
  const listeners = new Set<() => void>()
  const safe = <T>(fn: () => T, fallback: T): T => {
    try {
      return fn()
    } catch {
      return fallback
    }
  }

  function readIndex(): number | null {
    const saved = safe(() => progress.getItem(stepKey), null)
    const n = saved === null ? Number.NaN : Number(saved)
    if (Number.isInteger(n) && n >= 0 && n < tour.steps.length) return n
    return safe(() => done.getItem(doneKey), null) === '1' ? null : 0
  }

  function write(index: number | null) {
    safe(() => {
      if (index === null) {
        progress.removeItem(stepKey)
        done.setItem(doneKey, '1')
      } else {
        progress.setItem(stepKey, String(index))
      }
    }, undefined)
    for (const fn of listeners) fn()
  }

  return {
    index: readIndex,
    current() {
      const i = readIndex()
      return i === null ? null : tour.steps[i]
    },
    next() {
      const i = readIndex()
      if (i === null) return
      write(i + 1 < tour.steps.length ? i + 1 : null)
    },
    finish: () => write(null),
    start(target) {
      const i = tour.steps.findIndex((s) => s.target === target)
      write(i === -1 ? 0 : i)
    },
    subscribe(fn) {
      listeners.add(fn)
      return () => listeners.delete(fn)
    },
  }
}
