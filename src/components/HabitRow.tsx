import type { Habit } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheIcon } from '@/components/NicheGlyph'
import { IconFlame } from '@/components/icons'

interface HabitRowProps {
  habit: Habit
  /** ¿Está cumplido hoy? Controla el check y el tachado del título. */
  done: boolean
  /** Racha actual en días aplicables; se muestra desde 2 para no hacer ruido el día 1. */
  streak: number
  disabled?: boolean
  onToggle: () => void
}

/**
 * Fila de UN TOQUE para la pantalla Hoy: el hábito entero se resuelve con el
 * check redondo, sin detalle ni cronómetro. Reutiliza la anatomía de .task
 * (check + título + meta) para que conviva visualmente con el plan del día,
 * y se tiñe por nicho para que el área se lea de un vistazo.
 */
export function HabitRow({ habit, done, streak, disabled, onToggle }: HabitRowProps) {
  return (
    <div className={`task${done ? ' task--done' : ''}`} style={nicheAccent(habit.area)}>
      <button
        type="button"
        className={`check${done ? ' check--done' : ''}`}
        disabled={disabled}
        aria-pressed={done}
        aria-label={`${done ? 'Desmarcar' : 'Marcar'} el hábito: ${habit.title}`}
        onClick={onToggle}
      />
      {/* Ícono del área teñido con --niche (lo setea nicheAccent en el contenedor). */}
      <span
        aria-hidden="true"
        style={{ color: 'var(--niche)', display: 'inline-flex', flex: 'none', marginTop: 6 }}
      >
        <NicheIcon area={habit.area} size={16} />
      </span>
      <div className="task__main">
        <span className="task__title">{habit.title}</span>
      </div>
      {streak >= 2 && (
        <span className="streak-chip" title={`Racha de ${streak} días`}>
          <IconFlame size={13} /> {streak}
        </span>
      )}
    </div>
  )
}
