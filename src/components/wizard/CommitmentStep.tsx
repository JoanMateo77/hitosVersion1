import { useRef, useState } from 'react'
import type { ScheduleBlock, TargetKind } from '@/lib/types'
import {
  COUNT_UNITS,
  WEEKDAY_LABELS,
  WEEKDAY_PRESETS,
  blockEndTime,
  durationStep,
  expandMomentsToDays,
  formatCommitmentSummary,
  momentsOfDay,
  overcommitWarning,
  rangeMinutes,
  uniformMoments,
  type CommitmentBlockDraft,
  type CommitmentMoment,
} from '@/domain/commitment'
import { formatDuration } from '@/lib/date'
import { IconClose, IconTimer } from '@/components/icons'

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

  // Modo por defecto: un mismo horario para todos los días. Al editar una meta
  // que ya tenía días distintos, arrancamos en "personalizar por día".
  const [perDay, setPerDay] = useState(
    () => blocks.length > 0 && uniformMoments(blocks) === null,
  )
  const [rangeError, setRangeError] = useState<string | null>(null)

  // Memoria por tipo de medida: si vuelves de Cantidad a Tiempo (mismos días),
  // recuperas lo que habías escrito en vez de los defaults. No convertimos entre
  // tipos: "30 minutos" y "30 páginas" siguen sin ser intercambiables.
  const kindMemory = useRef<Partial<Record<TargetKind, CommitmentBlockDraft[]>>>({})
  const daysSignature = (bs: CommitmentBlockDraft[]) => bs.map((b) => b.weekday).sort().join(',')

  function defaultMoment(withStart: boolean): CommitmentMoment {
    return {
      targetKind: kind,
      targetValue: kind === 'time' ? defaultMinutes : 10,
      unit: kind === 'count' ? unit || null : null,
      startTime: withStart ? defaultStart : null,
    }
  }

  /** El horario del primer día configurado; semilla para días nuevos y presets. */
  function templateMoments(): CommitmentMoment[] {
    if (selectedDays.length === 0) return [defaultMoment(true)]
    return momentsOfDay(blocks, selectedDays[0])
  }

  function toggleDay(weekday: number) {
    setRangeError(null)
    if (selectedDays.includes(weekday)) {
      onChange(blocks.filter((b) => b.weekday !== weekday))
      return
    }
    // Un día nuevo hereda el horario ya configurado, no los defaults del perfil.
    onChange([...blocks, ...templateMoments().map((m) => ({ ...m, weekday }))])
  }

  function applyPreset(days: number[]) {
    setRangeError(null)
    const template = templateMoments()
    const kept = blocks.filter((b) => days.includes(b.weekday))
    const added = days
      .filter((d) => !selectedDays.includes(d))
      .flatMap((weekday) => template.map((m) => ({ ...m, weekday })))
    onChange([...kept, ...added])
  }

  function setKind(next: TargetKind) {
    if (next === kind) return
    kindMemory.current[kind] = blocks
    const remembered = kindMemory.current[next]
    if (remembered && daysSignature(remembered) === daysSignature(blocks)) {
      onChange(remembered)
      return
    }
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

  function removeBlock(index: number) {
    onChange(blocks.filter((_, i) => i !== index))
  }

  function addMomentToDay(weekday: number) {
    onChange([...blocks, { ...defaultMoment(false), weekday }])
  }

  function copyDayToAll(weekday: number) {
    setRangeError(null)
    onChange(expandMomentsToDays(momentsOfDay(blocks, weekday), selectedDays))
  }

  // --- Modo "mismo horario todos los días": editamos la lista de momentos
  // compartida y la replicamos en cada día elegido.
  const sharedMoments = selectedDays.length > 0 ? momentsOfDay(blocks, selectedDays[0]) : []

  function applyShared(moments: CommitmentMoment[]) {
    onChange(expandMomentsToDays(moments, selectedDays))
  }

  function patchShared(index: number, patch: Partial<CommitmentMoment>) {
    applyShared(sharedMoments.map((m, i) => (i === index ? { ...m, ...patch } : m)))
  }

  function switchMode() {
    setRangeError(null)
    if (perDay) {
      // Volver a horario único: gana el del primer día configurado.
      applyShared(templateMoments())
      setPerDay(false)
      return
    }
    setPerDay(true)
  }

  function momentRow(
    moment: CommitmentMoment,
    patch: (p: Partial<CommitmentMoment>) => void,
    remove: (() => void) | null,
  ) {
    const removeButton = remove && (
      <button type="button" className="iconbtn" aria-label="Quitar este momento" onClick={remove}>
        <IconClose size={16} />
      </button>
    )

    if (kind === 'time' && moment.startTime) {
      const end = blockEndTime(moment) ?? ''
      return (
        <div className="row wrap" style={{ alignItems: 'center' }}>
          <span className="faint tiny">De</span>
          <input
            className="input"
            style={{ maxWidth: 110 }}
            type="time"
            aria-label="Hora de inicio"
            value={moment.startTime}
            onChange={(e) => {
              setRangeError(null)
              patch({ startTime: e.target.value || null })
            }}
          />
          <span className="faint tiny">a</span>
          <input
            className="input"
            style={{ maxWidth: 110 }}
            type="time"
            aria-label="Hora de fin"
            value={end}
            onChange={(e) => {
              if (!e.target.value || !moment.startTime) return
              const minutes = rangeMinutes(moment.startTime, e.target.value)
              if (minutes === null) {
                setRangeError('La hora de fin debe quedar después de la de inicio.')
                return
              }
              setRangeError(null)
              patch({ targetValue: minutes })
            }}
          />
          <strong style={{ marginLeft: 'auto' }}>{formatDuration(moment.targetValue)}</strong>
          {removeButton}
        </div>
      )
    }

    const step = (direction: 1 | -1) =>
      kind === 'time' ? durationStep(moment.targetValue, direction) : 1
    return (
      <div className="row" style={{ alignItems: 'center' }}>
        <button
          type="button"
          className="iconbtn"
          aria-label="Restar"
          onClick={() =>
            patch({
              targetValue: Math.max(
                kind === 'time' ? 5 : 1,
                moment.targetValue - step(-1),
              ),
            })
          }
        >
          −
        </button>
        <span style={{ minWidth: 76, textAlign: 'center', fontWeight: 700 }}>
          {kind === 'time'
            ? formatDuration(moment.targetValue)
            : `${moment.targetValue} ${moment.unit ?? ''}`}
        </span>
        <button
          type="button"
          className="iconbtn"
          aria-label="Sumar"
          onClick={() => patch({ targetValue: moment.targetValue + step(1) })}
        >
          +
        </button>
        <input
          className="input"
          style={{ maxWidth: 120, marginLeft: 'auto' }}
          type="time"
          aria-label="Hora de inicio (opcional)"
          value={moment.startTime ?? ''}
          onChange={(e) => patch({ startTime: e.target.value || null })}
        />
        {removeButton}
      </div>
    )
  }

  return (
    <div className="stack">
      <div className="row wrap" role="group" aria-label="Atajos de días">
        {WEEKDAY_PRESETS.map((preset) => {
          const active =
            preset.days.length === selectedDays.length &&
            preset.days.every((d) => selectedDays.includes(d))
          return (
            <button
              key={preset.label}
              type="button"
              className={`chip${active ? ' chip--selected' : ''}`}
              aria-pressed={active}
              onClick={() => applyPreset(preset.days)}
            >
              {preset.label}
            </button>
          )
        })}
      </div>

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
          <IconTimer size={14} /> Tiempo
        </button>
        <button
          type="button"
          className={`chip${kind === 'count' ? ' chip--selected' : ''}`}
          aria-pressed={kind === 'count'}
          onClick={() => setKind('count')}
        >
          Cantidad
        </button>
        {kind === 'count' && (
          <select
            className="input"
            style={{ maxWidth: 160 }}
            aria-label="Qué vas a medir"
            value={unit}
            onChange={(e) => onChange(blocks.map((b) => ({ ...b, unit: e.target.value || null })))}
          >
            <option value="" disabled>
              ¿Qué mides?
            </option>
            {/* Unidad de texto libre de metas viejas: se muestra, pero al cambiarla
                solo se puede elegir del catálogo (datos consistentes para gráficas). */}
            {unit && !COUNT_UNITS.includes(unit as (typeof COUNT_UNITS)[number]) && (
              <option value={unit}>{unit}</option>
            )}
            {COUNT_UNITS.map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
        )}
      </div>

      {!perDay && selectedDays.length > 0 && (
        <div className="card card--tight stack stack--sm">
          <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
            <strong>Tu horario</strong>
            <span className="faint tiny">
              {selectedDays.map((d) => WEEKDAY_LABELS[d]).join(' · ')}
            </span>
          </div>
          {sharedMoments.map((moment, i) =>
            (
              <div key={i}>
                {momentRow(
                  moment,
                  (p) => patchShared(i, p),
                  sharedMoments.length > 1
                    ? () => applyShared(sharedMoments.filter((_, j) => j !== i))
                    : null,
                )}
              </div>
            ),
          )}
          <button
            type="button"
            className="btn--link"
            onClick={() => applyShared([...sharedMoments, defaultMoment(false)])}
          >
            + añadir otro momento
          </button>
        </div>
      )}

      {perDay && (
        <div className="stack stack--sm">
          {selectedDays.map((weekday) => (
            <div key={weekday} className="card card--tight stack stack--sm">
              <div className="row" style={{ justifyContent: 'space-between', alignItems: 'baseline' }}>
                <strong>{WEEKDAY_LABELS[weekday]}</strong>
                {selectedDays.length > 1 && (
                  <button
                    type="button"
                    className="btn--link tiny"
                    onClick={() => copyDayToAll(weekday)}
                  >
                    copiar a los demás días
                  </button>
                )}
              </div>
              {dayBlocks(weekday).map(({ block, index }) => (
                <div key={index}>
                  {momentRow(
                    block,
                    (p) => patchBlock(index, p),
                    dayBlocks(weekday).length > 1 ? () => removeBlock(index) : null,
                  )}
                </div>
              ))}
              <button type="button" className="btn--link" onClick={() => addMomentToDay(weekday)}>
                + añadir otro momento
              </button>
            </div>
          ))}
        </div>
      )}

      {selectedDays.length > 1 && (
        <button type="button" className="btn--link" onClick={switchMode}>
          {perDay ? 'Usar el mismo horario para todos los días' : 'Personalizar horario por día'}
        </button>
      )}

      {rangeError && (
        <p className="faint tiny" role="alert">
          {rangeError}
        </p>
      )}
      {blocks.length > 0 && <div className="alert">{formatCommitmentSummary(blocks)}</div>}
      {warning && (
        <div className="alert alert--warn" role="status" aria-live="polite" aria-atomic="true">
          {warning}
        </div>
      )}
      <p className="faint tiny">
        Las horas son opcionales: puedes poner solo la duración y fijar la hora después desde tu agenda.
      </p>
    </div>
  )
}
