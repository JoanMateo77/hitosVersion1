import type { ScheduleBlock, TargetKind } from '@/lib/types'
import {
  WEEKDAY_LABELS,
  formatCommitmentSummary,
  overcommitWarning,
  type CommitmentBlockDraft,
} from '@/domain/commitment'

interface CommitmentStepProps {
  blocks: CommitmentBlockDraft[]
  onChange: (blocks: CommitmentBlockDraft[]) => void
  /** Bloques de OTRAS metas del usuario, para la guardia de sobrecompromiso. */
  existing: ScheduleBlock[]
  /** Default de duración (del onboarding o 25). */
  defaultMinutes: number
  /** Hora sugerida según el momento preferido, o null. */
  defaultStart: string | null
}

const STEP_MINUTES = 5

export function CommitmentStep({
  blocks,
  onChange,
  existing,
  defaultMinutes,
  defaultStart,
}: CommitmentStepProps) {
  // El tipo de medida es uno solo por meta a nivel UI (los bloques lo copian).
  const kind: TargetKind = blocks[0]?.targetKind ?? 'time'
  const unit = blocks.find((b) => b.unit)?.unit ?? ''
  const selectedDays = [...new Set(blocks.map((b) => b.weekday))].sort()
  const warning = overcommitWarning(existing, blocks)

  function toggleDay(weekday: number) {
    if (selectedDays.includes(weekday)) {
      onChange(blocks.filter((b) => b.weekday !== weekday))
      return
    }
    onChange([
      ...blocks,
      {
        weekday,
        targetKind: kind,
        targetValue: kind === 'time' ? defaultMinutes : 10,
        unit: kind === 'count' ? unit || null : null,
        startTime: defaultStart,
      },
    ])
  }

  function setKind(next: TargetKind) {
    onChange(
      blocks.map((b) => ({
        ...b,
        targetKind: next,
        targetValue: next === 'time' ? defaultMinutes : 10,
        unit: next === 'count' ? unit || null : null,
      })),
    )
  }

  /** Los bloques de un día, con sus índices reales en `blocks`. */
  function dayBlocks(weekday: number): { block: CommitmentBlockDraft; index: number }[] {
    return blocks
      .map((block, index) => ({ block, index }))
      .filter((x) => x.block.weekday === weekday)
  }

  function patchBlock(index: number, patch: Partial<CommitmentBlockDraft>) {
    onChange(blocks.map((b, i) => (i === index ? { ...b, ...patch } : b)))
  }

  function addMoment(weekday: number) {
    onChange([
      ...blocks,
      {
        weekday,
        targetKind: kind,
        targetValue: kind === 'time' ? defaultMinutes : 10,
        unit: kind === 'count' ? unit || null : null,
        startTime: null,
      },
    ])
  }

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  return (
    <div className="stack">
      <div className="row wrap" role="group" aria-label="¿Qué días le vas a dedicar?">
        {WEEKDAY_LABELS.map((label, weekday) => (
          <button
            key={label}
            type="button"
            className={`chip${selectedDays.includes(weekday) ? ' chip--selected' : ''}`}
            aria-pressed={selectedDays.includes(weekday)}
            onClick={() => toggleDay(weekday)}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="row" role="group" aria-label="Cómo se mide cada sesión">
        <button
          type="button"
          className={`chip${kind === 'time' ? ' chip--selected' : ''}`}
          aria-pressed={kind === 'time'}
          onClick={() => setKind('time')}
        >
          ⏱ Tiempo
        </button>
        <button
          type="button"
          className={`chip${kind === 'count' ? ' chip--selected' : ''}`}
          aria-pressed={kind === 'count'}
          onClick={() => setKind('count')}
        >
          № Cantidad
        </button>
        {kind === 'count' && (
          <input
            className="input"
            style={{ maxWidth: 140 }}
            aria-label="Unidad (por ejemplo páginas)"
            placeholder="páginas, km…"
            value={unit}
            maxLength={30}
            onChange={(e) =>
              onChange(blocks.map((b) => ({ ...b, unit: e.target.value.trim() || null })))
            }
          />
        )}
      </div>

      <div className="stack stack--sm">
        {selectedDays.map((weekday) => (
          <div key={weekday} className="card card--tight stack stack--sm">
            <strong>{WEEKDAY_LABELS[weekday]}</strong>
            {dayBlocks(weekday).map(({ block, index }) => (
              <div key={index} className="row" style={{ alignItems: 'center' }}>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Restar"
                  onClick={() =>
                    patchBlock(index, {
                      targetValue: Math.max(
                        kind === 'time' ? STEP_MINUTES : 1,
                        block.targetValue - (kind === 'time' ? STEP_MINUTES : 1),
                      ),
                    })
                  }
                >
                  −
                </button>
                <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }}>
                  {kind === 'time' ? `${block.targetValue} min` : `${block.targetValue} ${block.unit ?? ''}`}
                </span>
                <button
                  type="button"
                  className="iconbtn"
                  aria-label="Sumar"
                  onClick={() =>
                    patchBlock(index, {
                      targetValue: block.targetValue + (kind === 'time' ? STEP_MINUTES : 1),
                    })
                  }
                >
                  +
                </button>
                <input
                  className="input"
                  style={{ maxWidth: 120, marginLeft: 'auto' }}
                  type="time"
                  aria-label="Hora del momento (opcional)"
                  value={block.startTime ?? ''}
                  onChange={(e) => patchBlock(index, { startTime: e.target.value || null })}
                />
                {dayBlocks(weekday).length > 1 && (
                  <button
                    type="button"
                    className="iconbtn"
                    aria-label="Quitar este momento"
                    onClick={() => removeBlock(index)}
                  >
                    ✕
                  </button>
                )}
              </div>
            ))}
            <button type="button" className="btn--link" onClick={() => addMoment(weekday)}>
              + añadir otro momento
            </button>
          </div>
        ))}
      </div>

      {blocks.length > 0 && <div className="alert">{formatCommitmentSummary(blocks)}</div>}
      {warning && <div className="alert alert--warn" role="status">{warning}</div>}
      <p className="faint tiny">La hora es opcional: puedes fijarla o cambiarla después desde tu agenda.</p>
    </div>
  )
}
