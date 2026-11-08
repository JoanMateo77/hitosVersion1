import { useSyncExternalStore } from 'react'
import { createTourState, IA_TOUR, type TourState } from '@/components/tour/tourState'

let state: TourState | null = null

/** Estado único del tour de "Organizar con IA" (el mismo en todas las pantallas). */
export function iaTour(): TourState {
  state ??= createTourState(IA_TOUR, localStorage, sessionStorage)
  return state
}

/** Índice del paso actual del tour (null = sin tour), reactivo. */
export function useIaTourIndex(): number | null {
  return useSyncExternalStore(
    (fn) => iaTour().subscribe(fn),
    () => iaTour().index(),
  )
}
