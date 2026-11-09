import { useCallback, useEffect, useRef } from 'react'
import { useToast } from '@/app/toast'
import type { Note } from '@/lib/types'
import { updateNote } from '@/services/notes'
import { toggleStored } from '@/domain/noteItems'

/**
 * Marcar un elemento desde la tarjeta, sin abrir la nota: se ve al instante y
 * se guarda en fila por nota (dos toques seguidos no se pisan). Si falla, la
 * tarjeta vuelve a como estaba y se avisa.
 *
 * La fecha de edición local no cambia: así la tarjeta no salta al principio de
 * la lista bajo el dedo. Al recargar la lista ya se ordena con la fecha real.
 */
export function useCardToggle(upsert: (note: Note) => void) {
  const { toast } = useToast()
  const upsertRef = useRef(upsert)
  useEffect(() => {
    upsertRef.current = upsert
  })
  const chains = useRef(new Map<string, Promise<unknown>>())

  return useCallback(
    (note: Note, index: number) => {
      if (!note.items) return
      const items = toggleStored(note.items, index)
      upsertRef.current({ ...note, items })
      const run = (chains.current.get(note.id) ?? Promise.resolve())
        .then(() => updateNote(note.id, { items }))
        .then((saved) => upsertRef.current({ ...saved, updatedAt: note.updatedAt }))
        .catch(() => {
          upsertRef.current(note)
          toast('No se pudo guardar la marca. Inténtalo de nuevo.', 'warning')
        })
      chains.current.set(note.id, run)
    },
    [toast],
  )
}
