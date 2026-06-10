import { useState, type KeyboardEvent } from 'react'
import type { Milestone } from '@/lib/types'
import { formatLongDate, todayISO } from '@/lib/date'

interface MilestoneChecklistProps {
  milestones: Milestone[]
  /** true cuando la meta no está activa: solo lectura. */
  disabled?: boolean
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
          <div className={`mstone${m.doneAt ? ' mstone--done' : ''}`}>
            <button
              type="button"
              className={`check${m.doneAt ? ' check--done' : ''}`}
              disabled={disabled}
              aria-pressed={m.doneAt !== null}
              aria-label={`${m.doneAt ? 'Desmarcar' : 'Marcar'} la etapa: ${m.title}`}
              onClick={() => onToggle(m)}
            />
            {editingId === m.id ? (
              <input
                className="input mstone__input"
                autoFocus
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
            {m.targetDate && <span className="tag mstone__date">📅 {formatLongDate(m.targetDate)}</span>}
            {!disabled && (
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-expanded={menuId === m.id}
                aria-label={`Opciones de la etapa: ${m.title}`}
                onClick={() => setMenuId(menuId === m.id ? null : m.id)}
              >
                ⋯
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
                ↑
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Bajar la etapa"
                disabled={index === milestones.length - 1}
                onClick={() => onMove(m, 1)}
              >
                ↓
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
                ✕
              </button>
            </div>
          )}
        </li>
      ))}

      {!disabled && (
        <li style={{ marginTop: 'var(--s2)' }}>
          {adding ? (
            <input
              className="input"
              autoFocus
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
