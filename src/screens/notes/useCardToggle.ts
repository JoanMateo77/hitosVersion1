import { useEffect, useRef, useState } from 'react'
import { useToast } from '@/app/toast'
import type { Note } from '@/lib/types'
import { updateNote } from '@/services/notes'
import { createCardToggleQueue } from '@/screens/notes/cardToggleQueue'

/** Marcar un elemento desde la tarjeta, sin abrir la nota (ver cardToggleQueue). */
export function useCardToggle(upsert: (note: Note) => void) {
  const { toast } = useToast()
  const upsertRef = useRef(upsert)
  const toastRef = useRef(toast)
  useEffect(() => {
    upsertRef.current = upsert
    toastRef.current = toast
  })
  const [queue] = useState(() =>
    createCardToggleQueue(
      (id, items) => updateNote(id, { items }),
      (note) => upsertRef.current(note),
      () => toastRef.current('No se pudo guardar la marca. Inténtalo de nuevo.', 'warning'),
    ),
  )
  return queue.toggle
}
