import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, NicheId, Note } from '@/lib/types'
import { listNotes } from '@/services/notes'
import { listGoals } from '@/services/goals'
import { visibleNotes, type NoteView } from '@/domain/notes'
import { SkeletonList } from '@/components/Skeleton'
import { IconArchive, IconNote, IconPlus } from '@/components/icons'
import { NicheIcon } from '@/components/NicheGlyph'
import { nicheAccent } from '@/lib/nicheAccent'
import { NoteSheet } from '@/screens/notes/NoteSheet'
import { NoteCard } from '@/screens/notes/NoteCard'
import { noteArea, noteErrorMessage, notePlaceLabel } from '@/screens/notes/noteUi'
import '@/styles/notes.css'

/**
 * Pantalla Notas (/notas): captura rápida estilo Keep. Todo cae en la Bandeja
 * y se ordena cuando se quiera (Metas, Áreas, Ideas). Las fijadas van arriba.
 * Desde la hoja de una nota se mueve, se archiva o se convierte en acción.
 */

/** Vistas del segmentado. Archivadas va aparte (botón junto al buscador):
 * cinco opciones no caben a 320 px sin cortar palabras. */
const TABS: { id: Exclude<NoteView, 'archived'>; label: string }[] = [
  { id: 'inbox', label: 'Bandeja' },
  { id: 'goals', label: 'Metas' },
  { id: 'areas', label: 'Áreas' },
  { id: 'ideas', label: 'Ideas' },
]
const VIEW_IDS: ReadonlySet<string> = new Set<NoteView>([...TABS.map((t) => t.id), 'archived'])

const EMPTY: Record<NoteView, { title: string; text: string }> = {
  inbox: {
    title: 'Tu bandeja está vacía',
    text: 'Anota lo que tengas en mente. Aquí cae todo y lo ordenas cuando quieras.',
  },
  goals: {
    title: 'Ninguna nota en tus metas',
    text: 'Abre una nota y elige «Mover a…» una meta. Aquí se agrupan por meta.',
  },
  areas: {
    title: 'Ninguna nota en tus áreas',
    text: 'Abre una nota y elige «Mover a…» un área. Aquí se agrupan por área.',
  },
  ideas: {
    title: 'Sin ideas guardadas',
    text: 'Mueve aquí lo que algún día quieras hacer, para que no ocupe la bandeja.',
  },
  archived: {
    title: 'Nada archivado',
    text: 'Las notas que archives o conviertas en acción quedan aquí.',
  },
}

/** Grupo de la vista Metas / Áreas: una meta o un área con sus notas. */
interface NoteGroup {
  key: string
  label: string
  area: NicheId | null
  notes: Note[]
}

/** Agrupa por meta o por área conservando el orden (fijadas y recientes primero). */
function groupNotes(list: Note[], goals: Goal[]): NoteGroup[] {
  const groups = new Map<string, NoteGroup>()
  for (const note of list) {
    const key = note.goalId ?? note.area ?? 'sin-lugar'
    const group = groups.get(key)
    if (group) group.notes.push(note)
    else
      groups.set(key, {
        key,
        label: notePlaceLabel(note, goals),
        area: noteArea(note, goals),
        notes: [note],
      })
  }
  return [...groups.values()]
}

/** La vista vive en ?vista= para sobrevivir a ir y volver. */
function readView(value: string | null): NoteView {
  return value !== null && VIEW_IDS.has(value) ? (value as NoteView) : 'inbox'
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

  const grouped = view === 'goals' || view === 'areas'
  const searching = query.trim() !== ''
  const empty = EMPTY[view]

  const renderList = (list: Note[], withPlace = true) => (
    <ul className="notes-list">
      {list.map((note) => (
        <li key={note.id}>
          <NoteCard
            note={note}
            goals={goals}
            withPlace={withPlace}
            onOpen={() => setSheet({ note })}
          />
        </li>
      ))}
    </ul>
  )

  /** Acción del estado vacío: lo que sirve hacer desde aquí. */
  function emptyAction() {
    if (searching)
      return (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => setQuery('')}>
          Borrar búsqueda
        </button>
      )
    if (view !== 'inbox' && inboxCount > 0)
      return (
        <button type="button" className="btn btn--ghost btn--sm" onClick={() => selectView('inbox')}>
          Ordenar la bandeja ({inboxCount})
        </button>
      )
    if (view === 'archived') return null
    return (
      <button type="button" className="btn btn--primary btn--sm" onClick={() => setSheet({ note: null })}>
        <IconPlus size={18} /> Escribir una nota
      </button>
    )
  }

  return (
    <div className="screen">
      <header className="row row--between screen__header">
        <h1 className="screen__title">Notas</h1>
        <button
          type="button"
          className="btn btn--primary btn--sm screen__add"
          aria-label="Nueva nota"
          onClick={() => setSheet({ note: null })}
        >
          <IconPlus size={18} /> Nota
        </button>
      </header>

      {loadError && <div className="alert alert--warn">{loadError}</div>}

      <div className="notes-bar">
        <fieldset className="seg notes-seg" aria-label="Vista de notas">
          {TABS.map((v) => (
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
        </fieldset>
        <div className="notes-search">
          <input
            type="search"
            className="input"
            placeholder="Buscar notas"
            aria-label="Buscar en tus notas"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <button
            type="button"
            className="notes-archived"
            aria-pressed={view === 'archived'}
            onClick={() => selectView(view === 'archived' ? 'inbox' : 'archived')}
          >
            <IconArchive size={18} />
            Archivadas
          </button>
        </div>
      </div>

      {notes === null && !loadError && <SkeletonList rows={3} />}

      {notes !== null && shown.length === 0 && (
        <div className="empty notes-empty">
          <span className="empty__icon">
            <IconNote size={32} />
          </span>
          <p className="empty__title">{searching ? 'Sin resultados' : empty.title}</p>
          <p className="muted">
            {searching ? `Ninguna nota coincide con «${query.trim()}».` : empty.text}
          </p>
          {emptyAction()}
        </div>
      )}

      {grouped &&
        groupNotes(shown, goals).map((group) => (
          <section key={group.key} className="notes-section" aria-label={group.label}>
            <div className="section-head notes-group">
              {group.area && (
                <span className="notes-group__glyph" style={nicheAccent(group.area)} aria-hidden="true">
                  <NicheIcon area={group.area} size={16} />
                </span>
              )}
              <h2 className="section-title notes-group__title">{group.label}</h2>
              <span className="small muted">{group.notes.length}</span>
            </div>
            {renderList(group.notes, false)}
          </section>
        ))}

      {!grouped && pinned.length > 0 && (
        <section className="notes-section" aria-label="Fijadas">
          <h2 className="section-title">Fijadas</h2>
          {renderList(pinned)}
        </section>
      )}
      {!grouped && others.length > 0 && (
        <section className="notes-section" aria-label="Notas">
          {pinned.length > 0 && <h2 className="section-title">Otras</h2>}
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
