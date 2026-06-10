import { todayISO } from '@/lib/date'
import type { MilestoneDraft } from '@/domain/commitment'

interface MilestonesStepProps {
  milestones: MilestoneDraft[]
  onChange: (milestones: MilestoneDraft[]) => void
}

/** Reasigna `position` según el orden del array (la única fuente de orden). */
function renumber(list: MilestoneDraft[]): MilestoneDraft[] {
  return list.map((m, position) => ({ ...m, position }))
}

export function MilestonesStep({ milestones, onChange }: MilestonesStepProps) {
  function patch(index: number, p: Partial<MilestoneDraft>) {
    onChange(milestones.map((m, i) => (i === index ? { ...m, ...p } : m)))
  }

  function remove(index: number) {
    onChange(renumber(milestones.filter((_, i) => i !== index)))
  }

  function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= milestones.length) return
    const next = [...milestones]
    ;[next[index], next[j]] = [next[j], next[index]]
    onChange(renumber(next))
  }

  function add() {
    onChange(
      renumber([...milestones, { title: '', position: milestones.length, targetDate: null, done: false }]),
    )
  }

  return (
    <div className="stack stack--sm">
      {milestones.map((m, index) => (
        <div key={index} className="card card--tight stack stack--sm">
          <div className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              aria-label={`Etapa ${index + 1}`}
              placeholder="Describe esta etapa…"
              value={m.title}
              maxLength={200}
              onChange={(e) => patch(index, { title: e.target.value })}
            />
            <button
              type="button"
              className="iconbtn"
              aria-label={`Subir la etapa ${index + 1}`}
              onClick={() => move(index, -1)}
            >
              ↑
            </button>
            <button
              type="button"
              className="iconbtn"
              aria-label={`Bajar la etapa ${index + 1}`}
              onClick={() => move(index, 1)}
            >
              ↓
            </button>
            <button
              type="button"
              className="iconbtn"
              aria-label={`Quitar la etapa ${index + 1}`}
              onClick={() => remove(index)}
            >
              ✕
            </button>
          </div>
          <div className="row" style={{ alignItems: 'center' }}>
            <input
              className="input"
              style={{ maxWidth: 170 }}
              type="date"
              aria-label={`Fecha objetivo de la etapa ${index + 1} (opcional)`}
              min={todayISO()}
              value={m.targetDate ?? ''}
              onChange={(e) => patch(index, { targetDate: e.target.value || null })}
            />
            {m.targetDate && (
              <button type="button" className="btn--link" onClick={() => patch(index, { targetDate: null })}>
                Quitar fecha
              </button>
            )}
          </div>
        </div>
      ))}
      <button type="button" className="btn btn--ghost btn--block" onClick={add}>
        + Agregar etapa
      </button>
      <p className="faint tiny">Estas etapas son tuyas: edítalas, reordénalas o cámbialas cuando quieras.</p>
    </div>
  )
}
