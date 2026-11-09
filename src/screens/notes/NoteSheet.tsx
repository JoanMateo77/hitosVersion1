import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import type { Goal, Note } from '@/lib/types'
import {
  deleteNote,
  fileNote,
  restoreNote,
  setNoteArchived,
  updateNote,
  type NoteDestination,
} from '@/services/notes'
import { addMilestone, listMilestones } from '@/services/milestones'
import { createUserTask } from '@/services/tasks'
import { itemsToLines, linesToItems, noteHeading, notePlace, noteWhy } from '@/domain/notes'
import {
  fromEditItems,
  newItemId,
  removeChecked,
  restoreRemoved,
  toEditItems,
  uncheckAll,
  type EditItem,
  type RemovedItem,
} from '@/domain/noteItems'
import { draftMatches, loadNoteDraft } from '@/lib/noteDraft'
import { seedWizardDraft } from '@/lib/wizardDraft'
import { todayISO } from '@/lib/date'
import { Sheet } from '@/components/Sheet'
import { IconChevronLeft } from '@/components/icons'
import { NoteConvertPicker, NoteMovePicker } from '@/screens/notes/NotePickers'
import { NoteActions } from '@/screens/notes/NoteActions'
import { NoteChecklist } from '@/screens/notes/NoteChecklist'
import { useNoteSave, type SaveStatus } from '@/screens/notes/useNoteSave'
import { noteErrorMessage, notePlaceLabel } from '@/screens/notes/noteUi'

type Panel = 'edit' | 'move' | 'convert'

const CONVERTED_MESSAGE = 'Listo. Archivamos la nota.'

const STATUS_TEXT: Record<SaveStatus, string> = {
  idle: '',
  saving: 'Guardando…',
  saved: 'Guardado',
  error: 'Sin guardar',
}

/**
 * Hoja de una nota (crear y editar). Se guarda sola mientras se escribe y al
 * cerrar —si una nota nueva queda vacía no se guarda—. Desde aquí se fija, se
 * pasa a lista, se mueve, se convierte en meta/etapa/tarea, se archiva o se
 * elimina (con "Deshacer"). Cada acción guarda antes lo escrito.
 */
export function NoteSheet({
  note,
  newGoalId = null,
  startAsList = false,
  goals,
  onChange,
  onRemove,
  onClose,
}: Readonly<{
  /** null = nota nueva. */
  note: Note | null
  /** Meta a la que nace vinculada una nota nueva (desde el detalle de meta). */
  newGoalId?: string | null
  /** Nota nueva que nace como lista (botón de lista de la barra de captura). */
  startAsList?: boolean
  /** Metas (todas): las activas alimentan "Mover a…" y "Convertir en…". */
  goals: Goal[]
  /** La nota se creó o cambió. */
  onChange: (note: Note) => void
  onRemove: (id: string) => void
  onClose: () => void
}>) {
  const { userId, profile } = useSession()
  const { toast, dismiss } = useToast()
  const navigate = useNavigate()

  // Si un guardado anterior de ESTA nota falló, se retoma lo que quedó escrito.
  const [recovered] = useState(() => {
    const draft = loadNoteDraft()
    return draft && draftMatches(draft, note?.id ?? null, newGoalId) ? draft : null
  })
  const [title, setTitle] = useState(recovered?.title ?? note?.title ?? '')
  const [body, setBody] = useState(recovered?.body ?? note?.body ?? '')
  const [items, setItems] = useState<EditItem[] | null>(() => {
    const start = recovered ? recovered.items : (note?.items ?? (note === null && startAsList ? [] : null))
    return start ? toEditItems(start, newItemId) : null
  })
  const [newItem, setNewItem] = useState('')
  const [panel, setPanel] = useState<Panel>('edit')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  /** Lo escrito, con el último renglón pendiente de la lista incluido. */
  const written = {
    title,
    body,
    items: items
      ? fromEditItems(newItem.trim() === '' ? items : [...items, { id: 'pending', text: newItem.trim(), done: false, indented: false }])
      : null,
  }

  const { saved, status, ensureSaved, remember, leave, skipLeave, clearDraft } = useNoteSave({
    note,
    newGoalId,
    recovered: recovered !== null,
    written,
    onChange,
    onRemove,
  })

  /**
   * Conversión a medias: la meta/etapa/tarea se creó pero archivar falló. Solo
   * se ofrece reintentar el archivado (con lo que seguía), nunca otra creación.
   */
  const [archivePending, setArchivePending] = useState(false)
  const afterArchiveRef = useRef<() => void>(() => undefined)

  // El "Deshacer" de quitar elementos solo vale con la hoja abierta.
  const itemUndoToast = useRef<number | null>(null)
  useEffect(
    () => () => {
      if (itemUndoToast.current !== null) dismiss(itemUndoToast.current)
    },
    [dismiss],
  )

  const activeGoals = goals.filter((g) => g.status === 'active')
  const archived = saved?.archivedAt != null

  function handleClosed() {
    leave()
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
    skipLeave()
    close()
  }

  /** Convierte: crea la meta/etapa/tarea y archiva la nota. */
  async function convert(n: Note, create: () => void | Promise<void>, after: () => void) {
    await create()
    await archiveConverted(n, after)
  }

  async function archiveConverted(n: Note, after: () => void) {
    try {
      remember(await setNoteArchived(n.id, true))
    } catch {
      afterArchiveRef.current = after
      setArchivePending(true)
      setError('Se creó, pero no pudimos archivar la nota.')
      return
    }
    setArchivePending(false)
    toast(CONVERTED_MESSAGE, 'success')
    after()
  }

  /** Archivar (o desarchivar) cierra la hoja; "Deshacer" lo revierte desde la lista. */
  function toggleArchived(close: () => void) {
    void act(async (n) => {
      const next = await setNoteArchived(n.id, !archived)
      remember(next)
      toast(archived ? 'Nota desarchivada' : 'Nota archivada', 'success', {
        action: {
          label: 'Deshacer',
          onAction: () => {
            setNoteArchived(n.id, archived)
              .then(onChange)
              .catch(() => toast('No se pudo deshacer.', 'warning'))
          },
        },
      })
      finish(close)
    })
  }

  /**
   * Eliminar sin preguntar: "Deshacer" vuelve a insertar la misma nota. Antes se
   * guarda lo escrito (esperando lo que esté en fila): así una nota recién
   * creada no reaparece y "Deshacer" recupera la última versión.
   */
  function removeNote(close: () => void) {
    skipLeave()
    setBusy(true)
    setError(null)
    ensureSaved()
      .then(async (current) => {
        if (current === null) {
          clearDraft()
          finish(close)
          return
        }
        await deleteNote(current.id)
        clearDraft()
        onRemove(current.id)
        toast('Nota eliminada', 'default', {
          action: {
            label: 'Deshacer',
            onAction: () => {
              restoreNote(current)
                .then(onChange)
                .catch(() => toast('No se pudo recuperar la nota.', 'warning'))
            },
          },
        })
        finish(close)
      })
      .catch((err: unknown) => {
        skipLeave(false)
        setError(noteErrorMessage(err, 'No se pudo eliminar la nota.'))
        setBusy(false)
      })
  }

  // --- Lista ----------------------------------------------------------------
  function toggleList() {
    // El "Deshacer" de un elemento quitado ya no tiene dónde volver.
    if (itemUndoToast.current !== null) dismiss(itemUndoToast.current)
    if (items) {
      // Lista → texto sin perder marcas ni sangría ("✓ ", tabulación).
      setBody(itemsToLines(written.items ?? []))
      setItems(null)
    } else {
      setItems(toEditItems(linesToItems(body), newItemId))
      setBody('')
    }
    setNewItem('')
  }

  function updateItems(update: (prev: EditItem[]) => EditItem[]) {
    setItems((prev) => (prev ? update(prev) : prev))
  }

  /** Quita elementos con "Deshacer" mientras la hoja siga abierta. */
  function removeWithUndo(removed: RemovedItem[], message: string) {
    if (removed.every((r) => r.item.text.trim() === '')) return
    itemUndoToast.current = toast(message, 'default', {
      action: { label: 'Deshacer', onAction: () => updateItems((prev) => restoreRemoved(prev, removed)) },
    })
  }

  function removeItem(index: number) {
    if (!items) return
    const removed = [{ index, item: items[index] }]
    updateItems((prev) => prev.filter((_, j) => j !== index))
    removeWithUndo(removed, 'Elemento quitado')
  }

  function removeCheckedItems() {
    if (!items) return
    const removed = items.flatMap((item, index) => (item.done ? [{ index, item }] : []))
    updateItems(removeChecked)
    removeWithUndo(removed, removed.length === 1 ? 'Se borró 1 marcado' : `Se borraron ${removed.length} marcados`)
  }

  const placeText = saved ? notePlaceLabel(saved, goals) : null
  const heading = note ? 'Nota' : 'Nota nueva'
  const isNew = note === null

  return (
    <Sheet onClose={handleClosed} label={heading} panelClassName="stack stack--lg note-sheet">
      {(close) => (
        <>
          <div className="row row--between note-sheet__head">
            <h2 style={{ fontSize: 'var(--fs-lg)' }}>{heading}</h2>
            <span className={`note-status note-status--${status}`}>{STATUS_TEXT[status]}</span>
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
              <div className="note-editor">
                {placeText && (
                  <span className="small muted">
                    {archived ? 'Archivada' : `En ${placeText}`}
                    {saved?.pinned ? ' · Fijada' : ''}
                  </span>
                )}
                <input
                  className="note-title"
                  placeholder="Título"
                  aria-label="Título"
                  enterKeyHint="next"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
                {items ? (
                  <NoteChecklist
                    items={items}
                    setItems={updateItems}
                    newItem={newItem}
                    setNewItem={setNewItem}
                    autoFocusAdd={isNew}
                    onRemove={removeItem}
                  />
                ) : (
                  <textarea
                    className="note-body"
                    placeholder="Escribe lo que tengas en mente…"
                    aria-label="Nota"
                    autoFocus={isNew}
                    value={body}
                    onChange={(e) => setBody(e.target.value)}
                  />
                )}
              </div>

              <NoteActions
                pinned={saved?.pinned ?? false}
                archived={archived}
                isList={items !== null}
                hasChecked={items?.some((i) => i.done) ?? false}
                busy={busy}
                onPin={() =>
                  void act(async (n) => {
                    remember(await updateNote(n.id, { pinned: !n.pinned }))
                  })
                }
                onToggleList={toggleList}
                onMove={() => setPanel('move')}
                onArchive={() => toggleArchived(close)}
                onConvert={() => setPanel('convert')}
                onUncheckAll={() => updateItems(uncheckAll)}
                onRemoveChecked={removeCheckedItems}
                onDelete={() => removeNote(close)}
              />
            </>
          )}

          {panel === 'move' && (
            <>
              <button type="button" className="back-link" onClick={() => setPanel('edit')}>
                <IconChevronLeft size={18} />
                Volver a la nota
              </button>
              <span className="section-title">Mover a…</span>
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
            </>
          )}

          {panel === 'convert' && (
            <>
              <button type="button" className="back-link" onClick={() => setPanel('edit')}>
                <IconChevronLeft size={18} />
                Volver a la nota
              </button>
              <span className="section-title">Convertir en…</span>
              {archivePending ? (
                <button
                  type="button"
                  className="btn btn--primary btn--block"
                  disabled={busy}
                  onClick={() => void act((n) => archiveConverted(n, afterArchiveRef.current))}
                >
                  Reintentar archivar
                </button>
              ) : (
                <NoteConvertPicker
                  goals={activeGoals}
                  busy={busy}
                  onGoal={() =>
                    void act((n) =>
                      convert(
                        n,
                        () =>
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
              )}
            </>
          )}

        </>
      )}
    </Sheet>
  )
}
