import { useState } from 'react'
import type { Goal } from '@/lib/types'
import type { NoteDestination } from '@/services/notes'
import { NICHES } from '@/domain/niches'
import { OptionRow } from '@/components/OptionRow'
import { NicheIcon } from '@/components/NicheGlyph'
import {
  IconArchive,
  IconCheck,
  IconFlag,
  IconGoals,
  IconLightbulb,
} from '@/components/icons'

/** "Mover a…": Bandeja, Ideas, una meta activa o un área. */
export function NoteMovePicker({
  goals,
  busy,
  onPick,
}: Readonly<{
  goals: Goal[]
  busy: boolean
  onPick: (to: NoteDestination, label: string) => void
}>) {
  return (
    <div className="stack">
      <div className="stack stack--sm">
        <OptionRow
          icon={<IconArchive size={20} />}
          label="Bandeja"
          disabled={busy}
          onClick={() => onPick({ place: 'inbox' }, 'Bandeja')}
        />
        <OptionRow
          icon={<IconLightbulb size={20} />}
          label="Ideas"
          disabled={busy}
          onClick={() => onPick({ place: 'ideas' }, 'Ideas')}
        />
      </div>

      {goals.length > 0 && (
        <div className="stack stack--sm">
          <span className="kicker">Una meta</span>
          {goals.map((g) => (
            <OptionRow
              key={g.id}
              icon={<IconGoals size={20} />}
              label={g.title}
              disabled={busy}
              onClick={() => onPick({ place: 'goal', goalId: g.id }, g.title)}
            />
          ))}
        </div>
      )}

      <div className="stack stack--sm">
        <span className="kicker">Un área</span>
        {NICHES.map((n) => (
          <OptionRow
            key={n.id}
            icon={<NicheIcon area={n.id} size={20} />}
            label={n.label}
            disabled={busy}
            onClick={() => onPick({ place: 'area', area: n.id }, n.label)}
          />
        ))}
      </div>
    </div>
  )
}

/** "Convertir en…": meta nueva, etapa de una meta activa o tarea de hoy. */
export function NoteConvertPicker({
  goals,
  busy,
  onGoal,
  onMilestone,
  onTask,
}: Readonly<{
  goals: Goal[]
  busy: boolean
  onGoal: () => void
  onMilestone: (goalId: string) => void
  onTask: () => void
}>) {
  // Etapa pide un paso más: elegir la meta que la recibe.
  const [choosingGoal, setChoosingGoal] = useState(false)

  if (choosingGoal) {
    return (
      <div className="stack stack--sm">
        <span className="kicker">¿En qué meta?</span>
        {goals.map((g) => (
          <OptionRow
            key={g.id}
            icon={<IconGoals size={20} />}
            label={g.title}
            disabled={busy}
            onClick={() => onMilestone(g.id)}
          />
        ))}
        <button type="button" className="btn--link" onClick={() => setChoosingGoal(false)}>
          Volver
        </button>
      </div>
    )
  }

  return (
    <div className="stack stack--sm">
      <OptionRow
        icon={<IconGoals size={20} />}
        label="Meta"
        desc="Abre el asistente con esta nota como punto de partida."
        disabled={busy}
        onClick={onGoal}
      />
      <OptionRow
        icon={<IconFlag size={20} />}
        label="Etapa"
        desc={
          goals.length > 0
            ? 'La suma al final del camino de una meta activa.'
            : 'Necesitas una meta activa para sumarle etapas.'
        }
        disabled={busy || goals.length === 0}
        onClick={() => setChoosingGoal(true)}
      />
      <OptionRow
        icon={<IconCheck size={20} />}
        label="Tarea de hoy"
        desc="La agrega a tu plan de hoy."
        disabled={busy}
        onClick={onTask}
      />
    </div>
  )
}
