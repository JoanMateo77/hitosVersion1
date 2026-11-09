import type { Note, NoteItem } from '@/lib/types'
import { toggleStored } from '@/domain/noteItems'

interface NoteState {
  /** Lo último que se ve (con los toques que faltan por guardar). */
  latest: NoteItem[]
  /** Lo último que la base confirmó. */
  confirmed: Note
  pending: number
  chain: Promise<void>
}

/**
 * Marcar desde la tarjeta, en fila por nota. Cada toque se ve al instante y
 * cada guardado manda lo último que se ve, así dos toques seguidos nunca se
 * pisan. Lo que confirma la base solo se muestra cuando ya no queda nada en
 * fila. Si un guardado falla, todo vuelve a lo último confirmado y se avisa.
 *
 * La fecha de edición local no cambia: así la tarjeta no salta al principio de
 * la lista bajo el dedo. Al recargar ya se ordena con la fecha real.
 */
export function createCardToggleQueue(
  save: (id: string, items: NoteItem[]) => Promise<Note>,
  show: (note: Note) => void,
  onFail: () => void,
) {
  const states = new Map<string, NoteState>()

  function toggle(note: Note, index: number) {
    if (!note.items) return
    const state = states.get(note.id) ?? {
      latest: note.items,
      confirmed: note,
      pending: 0,
      chain: Promise.resolve(),
    }
    states.set(note.id, state)
    state.latest = toggleStored(state.latest, index)
    state.pending += 1
    show({ ...note, items: state.latest })
    state.chain = state.chain.then(async () => {
      try {
        const saved = await save(note.id, state.latest)
        state.confirmed = { ...saved, updatedAt: note.updatedAt }
      } catch {
        state.latest = state.confirmed.items ?? []
        show(state.confirmed)
        onFail()
      } finally {
        state.pending -= 1
        if (state.pending === 0) {
          show(state.confirmed)
          states.delete(note.id)
        }
      }
    })
  }

  return { toggle }
}
