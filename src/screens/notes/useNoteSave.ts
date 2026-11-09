import { useEffect, useRef, useState } from 'react'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import type { Note, NoteItem } from '@/lib/types'
import { createNote, deleteNote, updateNote } from '@/services/notes'
import { isBlankNote } from '@/domain/notes'
import { clearNoteDraft, saveNoteDraft, type NoteDraft } from '@/lib/noteDraft'

/** Lo escrito en la hoja, tal cual (sin limpiar: es lo que se rescata si falla). */
export interface Written {
  title: string
  body: string
  items: NoteItem[] | null
}

/** idle: nada que contar · saving: escribiendo en la base · saved · error: quedó sin guardar. */
export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

/** Espera tras la última tecla antes de guardar solo. */
export const AUTOSAVE_MS = 800

/** Contenido listo para guardar: título vacío → null, lista sin renglones vacíos. */
function cleanContent(text: Written) {
  return {
    title: text.title.trim() === '' ? null : text.title.trim(),
    body: text.items ? '' : text.body,
    items: text.items ? text.items.filter((i) => i.text.trim() !== '') : null,
  }
}

function sameContent(note: Note, content: ReturnType<typeof cleanContent>): boolean {
  return (
    note.title === content.title &&
    note.body === content.body &&
    JSON.stringify(note.items) === JSON.stringify(content.items)
  )
}

/**
 * Guardado de la hoja de una nota, por un solo camino:
 * - automático, AUTOSAVE_MS después de dejar de escribir;
 * - al pasar la app a segundo plano (el sistema puede cerrarla);
 * - al salir de la hoja por cualquier vía (cierre animado, atrás, cambio de ruta).
 *
 * Los guardados van en fila: dos seguidos nunca crean la nota dos veces. Si uno
 * falla, lo escrito queda en sessionStorage para retomarlo al reabrir. Una nota
 * creada aquí que termina vacía se elimina al salir (como si no hubiera existido).
 */
export function useNoteSave({
  note,
  newGoalId,
  recovered,
  written,
  onChange,
  onRemove,
}: {
  note: Note | null
  newGoalId: string | null
  /** Hubo un borrador rescatado: se limpia en cuanto algo se guarde. */
  recovered: boolean
  written: Written
  onChange: (note: Note) => void
  onRemove: (id: string) => void
}) {
  const { userId } = useSession()
  const { toast } = useToast()
  const [saved, setSaved] = useState<Note | null>(note)
  const [status, setStatus] = useState<SaveStatus>('idle')
  const savedRef = useRef<Note | null>(note)
  const queue = useRef<Promise<unknown>>(Promise.resolve())
  /** true: ya se guardó al salir, o una acción dejó todo listo (no volver a guardar). */
  const doneRef = useRef(false)
  /**
   * Hay un borrador en sessionStorage de esta hoja (rescatado al abrir o escrito
   * por un guardado que falló): el primer guardado que funcione lo borra, para
   * que no vuelva a aparecer ni pise lo que ya quedó en la base.
   */
  const draftPending = useRef(recovered)
  function clearDraft() {
    if (!draftPending.current) return
    draftPending.current = false
    clearNoteDraft()
  }
  const createdHere = note === null

  function remember(next: Note) {
    savedRef.current = next
    setSaved(next)
    onChange(next)
  }

  /**
   * Guarda (crea o actualiza) y devuelve la nota; null si es nueva y está vacía.
   * `keepBlank`: una nota creada aquí no se vacía en la base mientras se edita
   * (se borra al salir si queda así).
   */
  function ensureSaved(text: Written = written, keepBlank = false): Promise<Note | null> {
    const content = cleanContent(text)
    const run = queue.current.then(async () => {
      const current = savedRef.current
      const blank = isBlankNote(content)
      if (current === null && blank) {
        // Borrar todo el texto rescatado también es descartarlo.
        clearDraft()
        return null
      }
      if (current !== null && (sameContent(current, content) || (keepBlank && blank && createdHere))) {
        return current
      }
      setStatus('saving')
      const result = current === null
        ? await createNote(userId, { ...content, goalId: newGoalId })
        : await updateNote(current.id, content)
      remember(result)
      setStatus('saved')
      clearDraft()
      return result
    })
    queue.current = run.catch(() => undefined)
    return run
  }

  function draftOf(text: Written): NoteDraft {
    return { noteId: savedRef.current?.id ?? null, goalId: newGoalId, ...text }
  }

  /** Guardado que no espera nadie: si falla, rescata lo escrito. */
  function persist(text: Written, keepBlank: boolean, onFail?: () => void) {
    ensureSaved(text, keepBlank).catch(() => {
      setStatus('error')
      saveNoteDraft(draftOf(text))
      draftPending.current = true
      onFail?.()
    })
  }

  // --- Automático -------------------------------------------------------------
  const writtenKey = JSON.stringify(written)
  const writtenRef = useRef(written)
  const firstKey = useRef(writtenKey)
  const persistRef = useRef(persist)
  // Los temporizadores y el desmontaje leen lo último escrito, no lo del primer render.
  useEffect(() => {
    writtenRef.current = written
    persistRef.current = persist
  })
  useEffect(() => {
    // Abrir la hoja no es escribir: sin cambios no hay nada que guardar.
    if (writtenKey === firstKey.current) return
    const t = window.setTimeout(() => {
      if (!doneRef.current) persistRef.current(writtenRef.current, true)
    }, AUTOSAVE_MS)
    return () => window.clearTimeout(t)
  }, [writtenKey])

  // --- Segundo plano -------------------------------------------------------------
  useEffect(() => {
    const onVisibility = () => {
      if (document.visibilityState === 'hidden' && !doneRef.current) {
        persistRef.current(writtenRef.current, true)
      }
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  // --- Al salir --------------------------------------------------------------
  /** Idempotente: nota nueva vacía → nada; sin cambios → nada. */
  function leave() {
    if (doneRef.current) return
    doneRef.current = true
    const text = writtenRef.current
    const blank = isBlankNote(cleanContent(text))
    if (createdHere && blank) {
      // Se guardó sola mientras tenía texto y después se vació: se elimina.
      void queue.current.then(async () => {
        const current = savedRef.current
        if (current === null) return
        await deleteNote(current.id)
        onRemove(current.id)
      }).catch(() => undefined)
      clearDraft()
      return
    }
    persist(text, false, () =>
      toast('No pudimos guardar la nota. La recuperamos al abrirla de nuevo.', 'warning'),
    )
  }

  const leaveRef = useRef(leave)
  useEffect(() => {
    leaveRef.current = leave
  })
  // Desmontaje sin animación de cierre (atrás de Android/PWA, cambio de ruta).
  // Se guarda en el tick siguiente: si es el desmontaje de prueba de StrictMode,
  // el montaje que sigue lo cancela (si no, una nota rescatada se crearía al abrir).
  const pendingLeave = useRef<number | null>(null)
  useEffect(() => {
    if (pendingLeave.current !== null) {
      window.clearTimeout(pendingLeave.current)
      pendingLeave.current = null
    }
    return () => {
      pendingLeave.current = window.setTimeout(() => leaveRef.current(), 0)
    }
  }, [])

  /**
   * Una acción va a dejar todo guardado (o eliminado): ni el guardado
   * automático ni la salida vuelven a guardar. `false` lo deshace si la acción falla.
   */
  function skipLeave(skip = true) {
    doneRef.current = skip
  }

  return { saved, status, ensureSaved, remember, leave, skipLeave, clearDraft }
}
