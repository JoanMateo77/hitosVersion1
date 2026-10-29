import { useEffect, useMemo, useState } from 'react'
import { useSession } from '@/app/session'
import type { Goal, Note } from '@/lib/types'
import { listNotes } from '@/services/notes'
import { listGoals } from '@/services/goals'
import { notesForGoal } from '@/domain/notes'
import { IconPlus } from '@/components/icons'
import { NoteCard } from '@/screens/notes/NoteCard'
import { NoteSheet } from '@/screens/notes/NoteSheet'
import '@/styles/notes.css'

/**
 * Sección "Notas" del detalle de una meta: las notas archivadas a esta meta y
 * "+ Nota" para crear una que ya nace vinculada. Carga lo suyo aparte para no
 * frenar el detalle; si Notas no está disponible (sin migración) queda vacía.
 */
export function GoalNotes({ goalId }: Readonly<{ goalId: string }>) {
  const { userId } = useSession()
  const [notes, setNotes] = useState<Note[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  // undefined = cerrada; null = nota nueva; Note = editar.
  const [open, setOpen] = useState<Note | null | undefined>(undefined)

  useEffect(() => {
    let active = true
    Promise.all([
      listNotes(userId).catch(() => [] as Note[]),
      listGoals(userId).catch(() => [] as Goal[]),
    ]).then(([loadedNotes, loadedGoals]) => {
      if (!active) return
      setNotes(loadedNotes)
      setGoals(loadedGoals)
    })
    return () => {
      active = false
    }
  }, [userId])

  const mine = useMemo(() => notesForGoal(notes, goalId), [notes, goalId])

  function upsert(note: Note) {
    setNotes((prev) =>
      prev.some((n) => n.id === note.id)
        ? prev.map((n) => (n.id === note.id ? note : n))
        : [note, ...prev],
    )
  }

  return (
    <div>
      <div className="section-head">
        <h2 style={{ fontSize: 'var(--fs-lg)' }}>Notas</h2>
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setOpen(null)}>
          <IconPlus size={16} /> Nota
        </button>
      </div>
      {mine.length === 0 ? (
        <p className="small muted">Ideas, enlaces o pendientes de esta meta, a mano.</p>
      ) : (
        <ul className="notes-list">
          {mine.map((note) => (
            <li key={note.id}>
              <NoteCard note={note} goals={goals} withPlace={false} onOpen={() => setOpen(note)} />
            </li>
          ))}
        </ul>
      )}
      {open !== undefined && (
        <NoteSheet
          note={open}
          newGoalId={goalId}
          goals={goals}
          onChange={upsert}
          onRemove={(id) => setNotes((prev) => prev.filter((n) => n.id !== id))}
          onClose={() => setOpen(undefined)}
        />
      )}
    </div>
  )
}
