import { useEffect, useRef, useState } from 'react'
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
import {
  isBlankNote,
  itemsToLines,
  linesToItems,
  noteHeading,
  notePlace,
  noteWhy,
} from '@/domain/notes'
import { clearNoteDraft, loadNoteDraft, saveNoteDraft } from '@/lib/noteDraft'
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

  // Si un guardado anterior de ESTA nota falló, se retoma lo que quedó escrito.
  const [recovered] = useState(() => {
    const draft = loadNoteDraft()
    return draft && draft.noteId === (note?.id ?? null) ? draft : null
  })
  const [title, setTitle] = useState(recovered?.title ?? note?.title ?? '')
  const [body, setBody] = useState(recovered?.body ?? note?.body ?? '')
  const [items, setItems] = useState<NoteItem[] | null>(
    recovered ? recovered.items : (note?.items ?? null),
  )
  const [newItem, setNewItem] = useState('')
  const [saved, setSaved] = useState<Note | null>(note)
  const [panel, setPanel] = useState<Panel>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const goalIdForNew = recovered ? recovered.goalId : newGoalId

  // Refs para el guardado al salir: corre cuando la hoja ya se desmontó.
  const savedRef = useRef<Note | null>(note)
  const skipSaveRef = useRef(false)
  /** true cuando ya se guardó al salir (cierre animado o desmontaje). */
  const leftRef = useRef(false)
  /** La conversión ya creó su meta/etapa/tarea: un reintento solo archiva. */
  const convertedRef = useRef(false)
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

  /** Lo escrito ahora mismo, sin limpiar (es lo que se rescata si falla). */
  const written = { title, body, items: currentItems() }

  /** Guarda lo escrito (crea o actualiza) y devuelve la nota; null si está vacía. */
  function ensureSaved(text: typeof written = written): Promise<Note | null> {
    const content = cleanContent(text.title, text.body, text.items)
    const run = queue.current.then(async () => {
      const current = savedRef.current
      let result: Note | null
      if (current === null) {
        if (isBlankNote(content)) return null
        result = await createNote(userId, { ...content, goalId: goalIdForNew })
        remember(result)
      } else if (sameContent(current, content)) {
        result = current
      } else {
        result = await updateNote(current.id, content)
        remember(result)
      }
      if (recovered) clearNoteDraft()
      return result
    })
    queue.current = run.catch(() => undefined)
    return run
  }

  /**
   * Guardado al salir de la hoja, por cualquier camino (cierre animado, atrás
   * del sistema, cambio de ruta). Idempotente: nota nueva vacía → nada; sin
   * cambios → nada. Si falla, lo escrito queda en sessionStorage para retomarlo.
   */
  function saveOnLeave() {
    if (skipSaveRef.current || leftRef.current) return
    leftRef.current = true
    const text = written
    ensureSaved(text).catch(() => {
      saveNoteDraft({
        noteId: savedRef.current?.id ?? null,
        goalId: goalIdForNew,
        title: text.title,
        body: text.body,
        items: text.items,
      })
      toast('No pudimos guardar la nota. La recuperamos al abrirla de nuevo.', 'warning')
    })
  }

  // El desmontaje necesita la versión de saveOnLeave del último render (con lo
  // último escrito), no la del primero.
  const saveOnLeaveRef = useRef(saveOnLeave)
  useEffect(() => {
    saveOnLeaveRef.current = saveOnLeave
  })

  // Desmontaje sin animación de cierre (atrás de Android/PWA, cambio de ruta).
  useEffect(
    () => () => {
      saveOnLeaveRef.current()
      // StrictMode monta dos veces: el segundo montaje vuelve a habilitar la salida.
      leftRef.current = false
    },
    [],
  )

  function handleClosed() {
    saveOnLeave()
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

  /**
   * Convierte: crea la meta/etapa/tarea UNA vez y archiva la nota. Si archivar
   * falla, un reintento solo vuelve a archivar (nunca duplica lo creado).
   */
  async function convert(n: Note, create: () => Promise<void>, after: () => void) {
    if (!convertedRef.current) {
      await create()
      convertedRef.current = true
    }
    try {
      remember(await setNoteArchived(n.id, true))
    } catch {
      setError('Se creó, pero no pudimos archivar la nota.')
      return
    }
    toast(CONVERTED_MESSAGE, 'success')
    after()
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
                  void act((n) =>
                    convert(
                      n,
                      async () =>
                        seedWizardDraft({
                          title: noteHeading(n),
                          templateKey: 'personalizada',
                          area:
                            notePlace(n) === 'area' && n.area
                              ? n.area
                              : (profile.primaryNiche ?? 'otra'),
                          milestones: [],
                          why: noteWhy(n),
                          step: 0,
                        }),
                      () => {
                        finish(close)
                        navigate('/meta/nueva')
                      },
                    ),
                  )
                }
                onMilestone={(goalId) =>
                  void act((n) =>
                    convert(
                      n,
                      async () => {
                        const count = (await listMilestones(goalId)).length
                        await addMilestone(userId, goalId, noteHeading(n), count)
                      },
                      () => finish(close),
                    ),
                  )
                }
                onTask={() =>
                  void act((n) =>
                    convert(
                      n,
                      async () => {
                        await createUserTask(userId, noteHeading(n), todayISO())
                      },
                      () => finish(close),
                    ),
                  )
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
                        if (recovered) clearNoteDraft()
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
