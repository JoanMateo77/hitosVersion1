import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import type { Goal, Note, NoteItem } from '@/lib/types'
import {
  createNote,
  deleteNote,
  fileNote,
  setNoteArchived,
  updateNote,
  type NoteDestination,
} from '@/services/notes'
import { addMilestone, listMilestones } from '@/services/milestones'
import { createUserTask } from '@/services/tasks'
import { isBlankNote, itemsToLines, linesToItems, noteHeading, notePlace } from '@/domain/notes'
import { seedWizardDraft } from '@/lib/wizardDraft'
import { todayISO } from '@/lib/date'
import { Sheet } from '@/components/Sheet'
import { IconCheck, IconClose, IconPlus } from '@/components/icons'
import { NoteConvertPicker, NoteMovePicker } from '@/screens/notes/NotePickers'
import { noteErrorMessage, notePlaceLabel } from '@/screens/notes/noteUi'

type Panel = 'edit' | 'move' | 'convert' | 'confirm-delete'

const CONVERTED_MESSAGE = 'Listo. Archivamos la nota.'

/** Contenido listo para guardar: título vacío → null, lista sin renglones vacíos. */
function cleanContent(title: string, body: string, items: NoteItem[] | null) {
  return {
    title: title.trim() === '' ? null : title.trim(),
    body: items ? '' : body,
    items: items ? items.filter((i) => i.text.trim() !== '') : null,
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
 * Hoja de una nota (crear y editar). Se guarda sola al cerrar —si al crear
 * quedó vacía no se guarda—, y desde aquí se fija, se mueve, se convierte en
 * meta/etapa/tarea, se archiva o se elimina. Cada acción guarda antes lo
 * escrito, así ninguna pierde texto.
 */
export function NoteSheet({
  note,
  newGoalId = null,
  goals,
  onChange,
  onRemove,
  onClose,
}: Readonly<{
  /** null = nota nueva. */
  note: Note | null
  /** Meta a la que nace vinculada una nota nueva (desde el detalle de meta). */
  newGoalId?: string | null
  /** Metas (todas): las activas alimentan "Mover a…" y "Convertir en…". */
  goals: Goal[]
  /** La nota se creó o cambió. */
  onChange: (note: Note) => void
  onRemove: (id: string) => void
  onClose: () => void
}>) {
  const { userId, profile } = useSession()
  const { toast } = useToast()
  const navigate = useNavigate()

  const [title, setTitle] = useState(note?.title ?? '')
  const [body, setBody] = useState(note?.body ?? '')
  const [items, setItems] = useState<NoteItem[] | null>(note?.items ?? null)
  const [newItem, setNewItem] = useState('')
  const [saved, setSaved] = useState<Note | null>(note)
  const [panel, setPanel] = useState<Panel>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Refs para el guardado al cerrar: corre después de que la hoja se desmonta.
  const savedRef = useRef<Note | null>(note)
  const skipSaveRef = useRef(false)
  /** Guardados en fila: dos acciones seguidas nunca crean la nota dos veces. */
  const queue = useRef<Promise<unknown>>(Promise.resolve())

  const activeGoals = goals.filter((g) => g.status === 'active')
  const archived = saved?.archivedAt != null

  function remember(next: Note) {
    savedRef.current = next
    setSaved(next)
    onChange(next)
  }

  /** Lo escrito, con el último renglón pendiente de la lista incluido. */
  function currentItems(): NoteItem[] | null {
    if (!items) return null
    return newItem.trim() === '' ? items : [...items, { text: newItem.trim(), done: false }]
  }

  /** Guarda lo escrito (crea o actualiza) y devuelve la nota; null si está vacía. */
  function ensureSaved(): Promise<Note | null> {
    const content = cleanContent(title, body, currentItems())
    const run = queue.current.then(async () => {
      const current = savedRef.current
      if (current === null) {
        if (isBlankNote(content)) return null
        const created = await createNote(userId, { ...content, goalId: newGoalId })
        remember(created)
        return created
      }
      if (sameContent(current, content)) return current
      const updated = await updateNote(current.id, content)
      remember(updated)
      return updated
    })
    queue.current = run.catch(() => undefined)
    return run
  }

  function handleClosed() {
    if (!skipSaveRef.current) {
      ensureSaved().catch((err: unknown) =>
        toast(noteErrorMessage(err, 'No se pudo guardar la nota.'), 'warning'),
      )
    }
    onClose()
  }

  /** Corre una acción sobre la nota ya guardada; muestra el error en la hoja. */
  async function act(action: (n: Note) => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      const n = await ensureSaved()
      if (n === null) {
        setError('Escribe algo primero.')
        return
      }
      await action(n)
    } catch (err) {
      setError(noteErrorMessage(err, 'No se pudo completar la acción.'))
    } finally {
      setBusy(false)
    }
  }

  /** Cierra sin volver a guardar (la acción ya dejó todo guardado). */
  function finish(close: () => void) {
    skipSaveRef.current = true
    close()
  }

  async function archiveConverted(n: Note) {
    remember(await setNoteArchived(n.id, true))
    toast(CONVERTED_MESSAGE, 'success')
  }

  // --- Lista ----------------------------------------------------------------
  function toggleList() {
    if (items) {
      setBody(itemsToLines(currentItems() ?? []))
      setItems(null)
    } else {
      setItems(linesToItems(body))
      setBody('')
    }
    setNewItem('')
  }

  function patchItem(index: number, patch: Partial<NoteItem>) {
    setItems((prev) => prev?.map((it, i) => (i === index ? { ...it, ...patch } : it)) ?? prev)
  }

  function addItem() {
    const text = newItem.trim()
    if (text === '') return
    setItems((prev) => [...(prev ?? []), { text, done: false }])
    setNewItem('')
  }

  const placeText = saved ? notePlaceLabel(saved, goals) : null
  const heading = note ? 'Nota' : 'Nota nueva'

  return (
    <Sheet onClose={handleClosed} label={heading}>
      {(close) => (
        <>
          <div className="row row--between">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{heading}</h2>
            <button type="button" className="btn btn--ghost btn--sm" onClick={close}>
              Listo
            </button>
          </div>

          {error && (
            <p className="alert alert--warn" role="alert">
              {error}
            </p>
          )}

          {panel === 'edit' && (
            <>
              <div className="stack stack--sm">
                {placeText && (
                  <span className="small muted">
                    {archived ? 'Archivada' : `En ${placeText}`}
                    {saved?.pinned ? ' · 📌 Fijada' : ''}
                  </span>
                )}
                <input
                  className="input"
                  placeholder="Título (opcional)"
                  aria-label="Título"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {items ? (
                  <ul className="note-items">
                    {items.map((it, i) => (
                      // El índice es la identidad del renglón: la lista no se reordena.
                      <li key={i} className="note-items__row">
                        <button
                          type="button"
                          className={`check${it.done ? ' check--done' : ''}`}
                          aria-label={it.done ? `Desmarcar: ${it.text}` : `Marcar: ${it.text}`}
                          aria-pressed={it.done}
                          onClick={() => patchItem(i, { done: !it.done })}
                        >
                          <IconCheck size={16} />
                        </button>
                        <input
                          className={`input note-items__text${it.done ? ' is-done' : ''}`}
                          aria-label={`Elemento ${i + 1}`}
                          value={it.text}
                          onChange={(e) => patchItem(i, { text: e.target.value })}
                        />
                        <button
                          type="button"
                          className="iconbtn iconbtn--sm"
                          aria-label={`Quitar: ${it.text}`}
                          onClick={() => setItems((prev) => prev?.filter((_, j) => j !== i) ?? prev)}
                        >
                          <IconClose size={16} />
                        </button>
                      </li>
                    ))}
                    <li className="note-items__row">
                      <span className="note-items__plus" aria-hidden="true">
                        <IconPlus size={16} />
                      </span>
                      <input
                        className="input"
                        placeholder="Agregar elemento"
                        aria-label="Agregar elemento"
                        value={newItem}
                        onChange={(e) => setNewItem(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault()
                            addItem()
                          }
                        }}
                      />
                    </li>
                  </ul>
                ) : (
                  <textarea
                    className="textarea note-body"
                    placeholder="Escribe lo que tengas en mente…"
                    aria-label="Nota"
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                )}
                <button
                  type="button"
                  className={`chip${items ? ' chip--selected' : ''}`}
                  style={{ alignSelf: 'flex-start' }}
                  aria-pressed={items !== null}
                  onClick={toggleList}
                >
                  Lista
                </button>
              </div>

              <div className="row wrap">
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async (n) => {
                      remember(await updateNote(n.id, { pinned: !n.pinned }))
                    })
                  }
                >
                  {saved?.pinned ? 'Desfijar' : 'Fijar'}
                </button>
                {!archived && (
                  <>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => setPanel('move')}
                    >
                      Mover a…
                    </button>
                    <button
                      type="button"
                      className="btn btn--ghost btn--sm"
                      disabled={busy}
                      onClick={() => setPanel('convert')}
                    >
                      Convertir en…
                    </button>
                  </>
                )}
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() =>
                    void act(async (n) => {
                      remember(await setNoteArchived(n.id, !archived))
                      toast(archived ? 'Nota desarchivada' : 'Nota archivada', 'success')
                      finish(close)
                    })
                  }
                >
                  {archived ? 'Desarchivar' : 'Archivar'}
                </button>
                <button
                  type="button"
                  className="btn btn--subtle btn--sm"
                  disabled={busy}
                  onClick={() => setPanel('confirm-delete')}
                >
                  Eliminar
                </button>
              </div>
            </>
          )}

          {panel === 'move' && (
            <>
              <span className="kicker">Mover a…</span>
              <NoteMovePicker
                goals={activeGoals}
                busy={busy}
                onPick={(to: NoteDestination, label: string) =>
                  void act(async (n) => {
                    remember(await fileNote(n.id, to))
                    toast(`Movida a ${label}`, 'success')
                    setPanel('edit')
                  })
                }
              />
              <button type="button" className="btn--link" onClick={() => setPanel('edit')}>
                Volver a la nota
              </button>
            </>
          )}

          {panel === 'convert' && (
            <>
              <span className="kicker">Convertir en…</span>
              <NoteConvertPicker
                goals={activeGoals}
                busy={busy}
                onGoal={() =>
                  void act(async (n) => {
                    seedWizardDraft({
                      title: noteHeading(n),
                      templateKey: 'personalizada',
                      area:
                        notePlace(n) === 'area' && n.area
                          ? n.area
                          : (profile.primaryNiche ?? 'otra'),
                      milestones: [],
                      why: n.items ? itemsToLines(n.items) : n.body,
                      step: 0,
                    })
                    await archiveConverted(n)
                    finish(close)
                    navigate('/meta/nueva')
                  })
                }
                onMilestone={(goalId) =>
                  void act(async (n) => {
                    const count = (await listMilestones(goalId)).length
                    await addMilestone(userId, goalId, noteHeading(n), count)
                    await archiveConverted(n)
                    finish(close)
                  })
                }
                onTask={() =>
                  void act(async (n) => {
                    await createUserTask(userId, noteHeading(n), todayISO())
                    await archiveConverted(n)
                    finish(close)
                  })
                }
              />
              <button type="button" className="btn--link" onClick={() => setPanel('edit')}>
                Volver a la nota
              </button>
            </>
          )}

          {panel === 'confirm-delete' && (
            <div className="card card--tight stack stack--sm" style={{ borderColor: 'var(--danger)' }}>
              <p className="small" style={{ margin: 0 }}>
                ¿Eliminar esta nota? No se puede deshacer.
              </p>
              <div className="row">
                <button
                  type="button"
                  className="btn btn--danger btn--sm"
                  disabled={busy}
                  onClick={() => {
                    const current = savedRef.current
                    if (current === null) {
                      finish(close)
                      return
                    }
                    setBusy(true)
                    deleteNote(current.id)
                      .then(() => {
                        onRemove(current.id)
                        toast('Nota eliminada')
                        finish(close)
                      })
                      .catch((err: unknown) => {
                        setError(noteErrorMessage(err, 'No se pudo eliminar la nota.'))
                        setBusy(false)
                      })
                  }}
                >
                  Sí, eliminar
                </button>
                <button
                  type="button"
                  className="btn btn--ghost btn--sm"
                  disabled={busy}
                  onClick={() => setPanel('edit')}
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </Sheet>
  )
}
