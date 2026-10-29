import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Note } from '@/lib/types'
import { listNotes } from '@/services/notes'
import { listGoals } from '@/services/goals'
import { visibleNotes, type NoteView } from '@/domain/notes'
import { SkeletonList } from '@/components/Skeleton'
import { IconNote, IconPlus } from '@/components/icons'
import { NoteSheet } from '@/screens/notes/NoteSheet'
import { NoteCard } from '@/screens/notes/NoteCard'
import { noteErrorMessage } from '@/screens/notes/noteUi'
import '@/styles/notes.css'

/**
 * Pantalla Notas (/notas): captura rápida estilo Keep. Todo cae en la Bandeja
 * y se ordena cuando se quiera (Metas, Áreas, Ideas). Las fijadas van arriba.
 * Desde la hoja de una nota se mueve, se archiva o se convierte en acción.
 */

const VIEWS: { id: NoteView; label: string }[] = [
  { id: 'inbox', label: 'Bandeja' },
  { id: 'goals', label: 'Metas' },
  { id: 'areas', label: 'Áreas' },
  { id: 'ideas', label: 'Ideas' },
  { id: 'archived', label: 'Archivadas' },
]

const EMPTY_TEXT: Record<NoteView, string> = {
  inbox: 'Aquí cae todo lo que anotas. Ordénalo cuando quieras.',
  goals: 'Las notas que muevas a una meta aparecen aquí.',
  areas: 'Las notas que muevas a un área aparecen aquí.',
  ideas: 'Guarda aquí lo que algún día quieras hacer.',
  archived: 'Nada archivado. Las notas que conviertas en acción quedan aquí.',
}

/** La vista vive en ?vista= para sobrevivir a ir y volver. */
function readView(value: string | null): NoteView {
  return VIEWS.some((v) => v.id === value) ? (value as NoteView) : 'inbox'
}

/** Hoja abierta: una nota existente o una nueva (null). */
type SheetState = { note: Note | null } | null

export function Notes() {
  const { userId } = useSession()
  const [params, setParams] = useSearchParams()
  const view = readView(params.get('vista'))
  const [query, setQuery] = useState('')
  const [notes, setNotes] = useState<Note[] | null>(null)
  const [goals, setGoals] = useState<Goal[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [sheet, setSheet] = useState<SheetState>(null)

  useEffect(() => {
    let active = true
    Promise.all([listNotes(userId), listGoals(userId).catch(() => [] as Goal[])])
      .then(([loadedNotes, loadedGoals]) => {
        if (!active) return
        setNotes(loadedNotes)
        setGoals(loadedGoals)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(noteErrorMessage(err, 'No se pudieron cargar tus notas.'))
      })
    return () => {
      active = false
    }
  }, [userId])

  const shown = useMemo(() => visibleNotes(notes ?? [], view, query), [notes, view, query])
  const inboxCount = useMemo(() => visibleNotes(notes ?? [], 'inbox', '').length, [notes])
  const pinned = shown.filter((n) => n.pinned)
  const others = shown.filter((n) => !n.pinned)

  function selectView(next: NoteView) {
    const nextParams = new URLSearchParams(params)
    nextParams.set('vista', next)
    setParams(nextParams, { replace: true })
  }

  function upsert(note: Note) {
    setNotes((prev) => {
      const list = prev ?? []
      return list.some((n) => n.id === note.id)
        ? list.map((n) => (n.id === note.id ? note : n))
        : [note, ...list]
    })
  }

  function remove(id: string) {
    setNotes((prev) => (prev ?? []).filter((n) => n.id !== id))
  }

  const renderList = (list: Note[]) => (
    <ul className="notes-list">
      {list.map((note) => (
        <li key={note.id}>
          <NoteCard note={note} goals={goals} onOpen={() => setSheet({ note })} />
        </li>
      ))}
    </ul>
  )

  return (
    <div className="screen">
      <header className="row row--between screen__header">
        <h1 className="screen__title">Notas</h1>
        <button className="btn btn--primary btn--sm" onClick={() => setSheet({ note: null })}>
          <IconPlus size={18} /> Nota
        </button>
      </header>

      {loadError && <div className="alert alert--warn">{loadError}</div>}

      <div className="notes-bar">
        <div className="seg notes-seg" role="group" aria-label="Vista de notas">
          {VIEWS.map((v) => (
            <button
              key={v.id}
              type="button"
              className={`seg__btn${view === v.id ? ' seg__btn--active' : ''}`}
              aria-pressed={view === v.id}
              onClick={() => selectView(v.id)}
            >
              {v.label}
              {v.id === 'inbox' && inboxCount > 0 && (
                <span className="notes-seg__count">{inboxCount}</span>
              )}
            </button>
          ))}
        </div>
        <input
          type="search"
          className="input"
          placeholder="Buscar en tus notas"
          aria-label="Buscar en tus notas"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {notes === null && !loadError && <SkeletonList rows={3} />}

      {notes !== null && shown.length === 0 && (
        <div className="empty">
          <span className="empty__icon">
            <IconNote size={32} />
          </span>
          <p className="empty__title">
            {query.trim() ? 'Sin resultados' : 'Nada por aquí'}
          </p>
          <p className="muted">
            {query.trim() ? `Ninguna nota coincide con «${query.trim()}».` : EMPTY_TEXT[view]}
          </p>
        </div>
      )}

      {pinned.length > 0 && (
        <section className="notes-section" aria-label="Fijadas">
          <span className="kicker">Fijadas</span>
          {renderList(pinned)}
        </section>
      )}
      {others.length > 0 && (
        <section className="notes-section" aria-label="Notas">
          {pinned.length > 0 && <span className="kicker">Otras</span>}
          {renderList(others)}
        </section>
      )}

      {sheet && (
        <NoteSheet
          note={sheet.note}
          goals={goals}
          onChange={upsert}
          onRemove={remove}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
