import type { Habit } from '@/lib/types'
import { formatTime12 } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { NicheIcon } from '@/components/NicheGlyph'
import { IconFlame } from '@/components/icons'

interface HabitRowProps {
  habit: Habit
  /** ¿Está cumplido hoy? (todas las repeticiones) Controla el check y el tachado. */
  done: boolean
  /** Racha actual en días aplicables; se muestra desde 2 para no hacer ruido el día 1. */
  streak: number
  /** Repeticiones del día (times.length; 1 si el hábito no tiene horas). */
  target?: number
  /** Repeticiones ya marcadas hoy. */
  doneCount?: number
  /** Hora "HH:MM" de la próxima repetición pendiente (null si no aplica). */
  nextTime?: string | null
  disabled?: boolean
  onToggle: () => void
}

/**
 * Fila de UN TOQUE para la pantalla Hoy: el hábito entero se resuelve con el
 * check redondo, sin detalle ni cronómetro. Si el hábito se repite en el día
 * (tiene horas), el mismo check marca la siguiente repetición y bajo el título
 * se ve el progreso ("2 de 5 · próxima 3:00 pm") con un puntito por repetición.
 * Reutiliza la anatomía de .task (check + título + meta) para que conviva
 * visualmente con el plan del día, y se tiñe por nicho.
 */
export function HabitRow({
  habit,
  done,
  streak,
  target = 1,
  doneCount = 0,
  nextTime = null,
  disabled,
  onToggle,
}: HabitRowProps) {
  const multi = target > 1
  return (
    <div className={`task${done ? ' task--done' : ''}`} style={nicheAccent(habit.area)}>
      <button
        type="button"
        className={`check${done ? ' check--done' : ''}`}
        disabled={disabled}
        aria-pressed={done}
        aria-label={
          done
            ? `Desmarcar ${multi ? 'la última repetición de' : 'el hábito:'} ${habit.title}`
            : `Marcar ${multi ? `repetición ${doneCount + 1} de ${target} de` : 'el hábito:'} ${habit.title}`
        }
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
        {multi && (
          <>
            <span className="faint tiny">
              {doneCount} de {target}
              {nextTime ? ` · próxima ${formatTime12(nextTime)}` : ''}
            </span>
            <span className="lesson-dots" aria-hidden="true">
              {Array.from({ length: target }, (_, i) => (
                <span key={i} data-read={i < doneCount ? 'true' : 'false'} />
              ))}
            </span>
          </>
        )}
      </div>
      {streak >= 2 && (
        <span className="streak-chip" title={`Racha de ${streak} días`}>
          <IconFlame size={13} /> {streak}
        </span>
      )}
    </div>
  )
}
