import { useState, type KeyboardEvent } from 'react'
import { todayISO, formatLongDate } from '@/lib/date'
import type { MilestoneDraft } from '@/domain/commitment'
import {
  IconArrowDown,
  IconArrowUp,
  IconCalendar,
  IconClose,
  IconDots,
} from '@/components/icons'

interface MilestonesStepProps {
  milestones: MilestoneDraft[]
  onChange: (milestones: MilestoneDraft[]) => void
}

/** Reasigna `position` según el orden del array (la única fuente de orden). */
function renumber(list: MilestoneDraft[]): MilestoneDraft[] {
  return list.map((m, position) => ({ ...m, position }))
}

/**
 * El camino en el wizard, calmo (backlog smoke #1): una línea por etapa, texto
 * editable al tocar, y fecha/orden/quitar detrás de "⋯". Mismo lenguaje visual
 * que el checklist del detalle de meta.
 */
export function MilestonesStep({ milestones, onChange }: MilestonesStepProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null)
  const [menuIndex, setMenuIndex] = useState<number | null>(null)
  const [adding, setAdding] = useState(false)

  function patch(index: number, p: Partial<MilestoneDraft>) {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...p } : m)))
  }

  function remove(index: number) {
    setMenuIndex(null)
    onChange(renumber(milestones.filter((_, i) => i !== index)))
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= milestones.length) return
    const next = [...milestones]
    ;[next[index], next[j]] = [next[j], next[index]]
    setMenuIndex(j)
    onChange(renumber(next))
  }

  function commitRename(index: number, value: string) {
    setEditingIndex(null)
    const title = value.trim()
    if (title) patch(index, { title })
  }

  function commitAdd(value: string) {
    setAdding(false)
    const title = value.trim()
    if (!title) return
    onChange(
      renumber([...milestones, { title, position: milestones.length, targetDate: null, done: false }]),
    )
  }

  function onEditKey(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter') e.currentTarget.blur()
    if (e.key === 'Escape') {
      e.currentTarget.value = ''
      setEditingIndex(null)
      setAdding(false)
    }
  }

  return (
    <ul className="stack" style={{ gap: 0, listStyle: 'none', padding: 0, margin: 0 }}>
      {milestones.map((m, index) => (
        <li key={index}>
          <div className="mstone">
            <span className="tag" aria-hidden="true" style={{ flex: 'none', minWidth: 28, justifyContent: 'center' }}>
              {index + 1}
            </span>
            {editingIndex === index ? (
              <input
                className="input mstone__input"
                autoFocus
                defaultValue={m.title}
                maxLength={200}
                aria-label={`Editar la etapa ${index + 1}`}
                onBlur={(e) => commitRename(index, e.target.value)}
                onKeyDown={onEditKey}
              />
            ) : (
              <button
                type="button"
                className="mstone__title"
                onClick={() => setEditingIndex(index)}
                aria-label={`Editar el texto de la etapa: ${m.title || 'sin título'}`}
              >
                {m.title || <span className="faint">Describe esta etapa…</span>}
              </button>
            )}
            {m.targetDate && (
              <span className="tag mstone__date">
                <IconCalendar size={11} /> {formatLongDate(m.targetDate)}
              </span>
            )}
            <button
              type="button"
              className="iconbtn iconbtn--sm"
              aria-expanded={menuIndex === index}
              aria-label={`Opciones de la etapa ${index + 1}`}
              onClick={() => setMenuIndex(menuIndex === index ? null : index)}
            >
              <IconDots size={17} />
            </button>
          </div>
          {menuIndex === index && (
            <div className="mstone__actions row wrap">
              <input
                className="input"
                style={{ maxWidth: 160 }}
                type="date"
                min={todayISO()}
                value={m.targetDate ?? ''}
                aria-label={`Fecha objetivo de la etapa ${index + 1}`}
                onChange={(e) => patch(index, { targetDate: e.target.value || null })}
              />
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Subir la etapa"
                disabled={index === 0}
                onClick={() => move(index, -1)}
              >
                <IconArrowUp size={15} />
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Bajar la etapa"
                disabled={index === milestones.length - 1}
                onClick={() => move(index, 1)}
              >
                <IconArrowDown size={15} />
              </button>
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                aria-label="Quitar la etapa"
                onClick={() => remove(index)}
              >
                <IconClose size={15} />
              </button>
            </div>
          )}
        </li>
      ))}

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
      <li>
        <p className="faint tiny" style={{ marginTop: 'var(--s3)' }}>
          Toca una etapa para editarla; con el menú de puntos le pones fecha, la ordenas o la
          quitas.
        </p>
      </li>
    </ul>
  )
}
