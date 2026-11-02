import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { Milestone } from '@/lib/types'
import { formatLongDate, todayISO } from '@/lib/date'
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconCheck,
  IconDots,
  IconTrash,
} from '@/components/icons'

interface MilestoneChecklistProps {
  milestones: Milestone[]
  /** true cuando la meta no está activa: solo lectura. */
  disabled?: boolean
  /** Etapa recién cumplida: se enciende un instante para que el logro se vea. */
  justDoneId?: string | null
  onToggle: (m: Milestone) => void
  onRename: (m: Milestone, title: string) => void
  onSetDate: (m: Milestone, date: string | null) => void
  onMove: (m: Milestone, dir: -1 | 1) => void
  onDelete: (m: Milestone) => void
  onAdd: (title: string) => void
}

/**
 * El camino como checklist calmo (backlog smoke #1): una línea por etapa,
 * texto editable al tocar, y las acciones (fecha, orden, quitar) detrás de "⋯".
 */
export function MilestoneChecklist({
  milestones,
  disabled = false,
  justDoneId = null,
  onToggle,
  onRename,
  onSetDate,
  onMove,
  onDelete,
  onAdd,
}: MilestoneChecklistProps) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [menuId, setMenuId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  // El campo recibe el foco solo cuando el usuario lo abre (tocar el título o
  // "+ Agregar etapa"), no al montar la pantalla.
  const editRef = useRef<HTMLInputElement>(null)
  const addRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (editingId) editRef.current?.focus()
  }, [editingId])
  useEffect(() => {
    if (adding) addRef.current?.focus()
  }, [adding])

  function commitRename(m: Milestone, value: string) {
    setEditingId(null)
    const title = value.trim()
    if (title && title !== m.title) onRename(m, title)
  }

  function commitAdd(value: string) {
    setAdding(false)
    const title = value.trim()
    if (title) onAdd(title)
  }

  function onEditKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      e.currentTarget.value = ''
      setEditingId(null)
      setAdding(false)
    }
  }

  return (
    <ul className="stack" style={{ gap: 0, listStyle: 'none', padding: 0, margin: 0 }}>
      {milestones.map((m, index) => (
        <li key={m.id}>
          <div
            className={`mstone${m.doneAt ? ' mstone--done' : ''}${
              justDoneId === m.id ? ' mstone--just-done' : ''
            }`}
          >
            <button
              type="button"
              className={`check${m.doneAt ? ' check--done' : ''}`}
              disabled={disabled}
              aria-pressed={m.doneAt !== null}
              aria-label={`${m.doneAt ? 'Desmarcar' : 'Marcar'} la etapa: ${m.title}`}
              onClick={() => onToggle(m)}
            >
              <IconCheck size={16} />
            </button>
            <span className="mstone__text">
              {editingId === m.id ? (
                <input
                  ref={editRef}
                  className="input mstone__input"
                  defaultValue={m.title}
                  maxLength={200}
                  aria-label={`Editar la etapa ${index + 1}`}
                  onBlur={(e) => commitRename(m, e.target.value)}
                  onKeyDown={onEditKey}
                />
              ) : (
                <button
                  type="button"
                  className="mstone__title"
                  disabled={disabled}
                  onClick={() => setEditingId(m.id)}
                  aria-label={`Editar el texto de la etapa: ${m.title}`}
                >
                  {m.title}
                </button>
              )}
              {/* La fecha va debajo del título: a su lado lo estrujaba en una
                  columna de dos palabras en móvil. */}
              {m.targetDate && editingId !== m.id && (
                <span className="mstone__date">
                  <IconCalendar size={11} /> {formatLongDate(m.targetDate)}
                </span>
              )}
            </span>
            {!disabled && (
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-expanded={menuId === m.id}
                aria-label={`Opciones de la etapa: ${m.title}`}
                onClick={() => setMenuId(menuId === m.id ? null : m.id)}
              >
                <IconDots size={17} />
              </button>
            )}
          </div>
          {menuId === m.id && !disabled && (
            <div className="mstone__actions row wrap">
              <input
                className="input"
                style={{ maxWidth: 160 }}
                type="date"
                min={todayISO()}
                value={m.targetDate ?? ''}
                aria-label={`Fecha objetivo de la etapa: ${m.title}`}
                onChange={(e) => onSetDate(m, e.target.value || null)}
              />
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Subir la etapa"
                disabled={index === 0}
                onClick={() => onMove(m, -1)}
              >
                <IconArrowUp size={15} />
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Bajar la etapa"
                disabled={index === milestones.length - 1}
                onClick={() => onMove(m, 1)}
              >
                <IconArrowDown size={15} />
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label={`Quitar la etapa: ${m.title}`}
                onClick={() => {
                  setMenuId(null)
                  onDelete(m)
                }}
              >
                <IconTrash size={15} />
              </button>
            </div>
          )}
        </li>
      ))}

      {!disabled && (
        <li style={{ marginTop: 'var(--s2)' }}>
          {adding ? (
            <input
              ref={addRef}
              className="input"
              placeholder="Describe la nueva etapa…"
              maxLength={200}
              aria-label="Nueva etapa"
              onBlur={(e) => commitAdd(e.target.value)}
              onKeyDown={onEditKey}
            />
          ) : (
            <button type="button" className="btn--link" onClick={() => setAdding(true)}>
              + Agregar etapa
            </button>
          )}
        </li>
      )}
    </ul>
  )
}
