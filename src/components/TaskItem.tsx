import { useState } from 'react'
import type { Task } from '@/lib/types'
import { IconArrowReturn, IconCheck, IconClose, IconPencil } from '@/components/icons'

interface TaskItemProps {
  task: Task
  /** Título de la meta de origen, si la acción deriva de una meta. */
  goalTitle?: string | null
  /** Porqué de la meta, anclaje emocional que mostramos junto a la acción. */
  goalWhy?: string | null
  /** True si la tarea pertenece al foco de la semana — borde verde a la izquierda. */
  isFocus?: boolean
  onToggle: () => void
  onEdit: (title: string) => void
  onRemove: () => void
}

export function TaskItem({
  task,
  goalTitle,
  goalWhy,
  isFocus,
  onToggle,
  onEdit,
  onRemove,
}: TaskItemProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(task.title)
  const done = task.status === 'done'
  // Las acciones de meta se "saltan por hoy" (postpone); las propias se borran.
  const isGoalTask = task.source === 'goal' || task.source === 'suggested'
  const removeLabel = isGoalTask ? 'Saltar por hoy' : 'Borrar tarea'
  const removeHint = isGoalTask
    ? 'La saltás sólo hoy. Mañana volvé si toca por frecuencia.'
    : 'Borrar esta tarea.'

  function save() {
    const clean = draft.trim()
    if (clean && clean !== task.title) onEdit(clean)
    else setDraft(task.title)
    setEditing(false)
  }

  if (editing) {
    return (
      <li className="task">
        <input
          className="input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') save()
            if (e.key === 'Escape') {
              setDraft(task.title)
              setEditing(false)
            }
          }}
          maxLength={300}
          autoCapitalize="sentences"
          autoCorrect="on"
          enterKeyHint="done"
          inputMode="text"
        />
        <button className="iconbtn" onClick={save} aria-label="Guardar">
          <IconCheck size={20} />
        </button>
      </li>
    )
  }

  return (
    <li className={`task${done ? ' task--done' : ''}${isFocus ? ' task--focus' : ''}`}>
      <button
        className={`check${done ? ' check--done' : ''}`}
        onClick={onToggle}
        aria-label={done ? 'Marcar como pendiente' : 'Marcar como hecha'}
        aria-pressed={done}
      >
        <IconCheck size={16} />
      </button>

      <div className="task__main">
        <span className="task__title">{task.title}</span>
        {goalTitle && (
          <span className="task__meta">
            <span className="tag">
              <IconArrowReturn size={11} />
              {goalTitle}
            </span>
          </span>
        )}
        {goalWhy && goalWhy.trim() && (
          <span className="task__why faint tiny">Porque {goalWhy.trim()}</span>
        )}
      </div>

      <button className="iconbtn" onClick={() => setEditing(true)} aria-label="Editar">
        <IconPencil size={17} />
      </button>
      <button className="iconbtn" onClick={onRemove} aria-label={removeLabel} title={removeHint}>
        <IconClose size={18} />
      </button>
    </li>
  )
}
