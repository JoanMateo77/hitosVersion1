import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Habit } from '@/lib/types'
import {
  daysLabel,
  habitColor,
  habitTarget,
  progressLabel,
  type HabitDayProgress,
  type HabitSuggestion,
} from '@/domain/habits'
import { HabitIcon } from '@/components/HabitIcon'
import { IconCheck, IconChevronRight, IconFlame, IconPlus } from '@/components/icons'
import { formatTime12, parseISO } from '@/lib/date'

/**
 * Las filas de la pantalla Hábitos, una por pestaña: Hoy (con su control a la
 * derecha), Todos, Saltados, Archivados y las sugerencias del primer uso.
 *
 * Regla común de accesibilidad: el <li> nunca escucha toques. Lo que navega es
 * un <Link> y lo que actúa es un <button> con su aria-label; cuando una fila
 * hace las dos cosas se parte en cuerpo (navega) y control (marca).
 */

const DAY_MONTH = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })

/** "2026-09-30" → "30 sept" (sin el punto que agrega Intl en algunos meses). */
function shortDate(dateISO: string): string {
  return DAY_MONTH.format(parseISO(dateISO)).replace('.', '')
}

/** Hora local de un check ("…T12:12:31Z" → "7:12 am"). */
function clockOf(iso: string): string | null {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return null
  const hh = String(date.getHours()).padStart(2, '0')
  const mm = String(date.getMinutes()).padStart(2, '0')
  return formatTime12(`${hh}:${mm}`)
}

/** "🔥 3" pegado al texto que lo precede, o la cola "· sin racha" en faint. */
function StreakTail({ streak }: Readonly<{ streak: number }>) {
  if (streak <= 0) return <span className="hab-row__sub-faint"> · sin racha</span>
  return (
    <>
      <IconFlame size={12} className="hab-row__flame" />
      {streak}
    </>
  )
}

/** "Racha de 3 días" o, sin racha vigente, el genérico "Hecho hoy". */
function doneCaption(streak: number): string {
  if (streak <= 0) return 'Hecho hoy'
  return `Racha de ${streak} ${streak === 1 ? 'día' : 'días'}`
}

/** Variante del control de la derecha: qué pinta según el estado del hábito. */
function controlVariant(complete: boolean, multi: boolean): 'done' | 'add' | 'ring' {
  if (complete) return 'done'
  if (multi) return 'add'
  return 'ring'
}

/** Glifo del control de la derecha, a tono con `controlVariant`. */
function ControlGlyph({ complete, multi }: Readonly<{ complete: boolean; multi: boolean }>) {
  if (complete) return <IconCheck size={20} />
  if (multi) return <IconPlus size={18} />
  return null
}

/** Subtítulo de la fila de Hoy: barra de repeticiones, "hecho" o días/racha. */
function HabitTodayRowSub({
  habit,
  progress,
  asDone,
  celebrating,
  streak,
  time,
}: Readonly<{
  habit: Habit
  progress: HabitDayProgress
  asDone: boolean
  celebrating: boolean
  streak: number
  time: string | null
}>) {
  const { done, target, complete } = progress
  const multi = target > 1

  if (multi && !asDone) {
    return (
      <span className="hab-progress">
        <span className="hab-progress__bar" aria-hidden="true">
          {Array.from({ length: target }, (_, i) => (
            <span
              key={i}
              className={`hab-progress__seg${i < done ? ' is-on' : ''}${
                celebrating && i === target - 1 ? ' is-last' : ''
              }`}
            />
          ))}
        </span>
        <span className={`hab-progress__label${complete ? ' is-complete' : ''}`}>
          {complete ? `${done} de ${target} ✓` : progressLabel(habit, done)}
        </span>
      </span>
    )
  }

  if (asDone) {
    return (
      <span className="hab-row__sub hab-row__sub--done">
        <IconFlame size={12} />
        <span>{doneCaption(streak)}</span>
        {time && <span className="hab-row__sub-faint">· {time}</span>}
      </span>
    )
  }

  return (
    <span className="hab-row__sub">
      {daysLabel(habit.weekdays)}
      <StreakTail streak={streak} />
    </span>
  )
}

/** Cuántas repeticiones pide el día, con su unidad: "5 vasos" / "5 veces". */
function timesLabel(habit: Habit): string {
  const target = habitTarget(habit)
  const unit = habit.unit && habit.unit.length > 0 ? habit.unit : 'veces'
  return `${target} ${unit}`
}

/* ===== Pestaña Hoy ======================================================== */

interface HabitTodayRowProps {
  habit: Habit
  /** Destino del cuerpo de la fila (el detalle, conservando la pestaña). */
  to: string
  progress: HabitDayProgress
  streak: number
  /** ISO del último check de hoy, para la hora en "Hechos". */
  lastAt: string | null
  /** Momento de festejo tras completar la última repetición (~1,2 s). */
  celebrating: boolean
  onToggle: () => void
}

export function HabitTodayRow({
  habit,
  to,
  progress,
  streak,
  lastAt,
  celebrating,
  onToggle,
}: Readonly<HabitTodayRowProps>) {
  const { target, complete } = progress
  const multi = target > 1
  // Mientras festeja, la fila sigue viéndose como la de "por hacer" recién
  // cumplida: barra llena, número teñido y check verde con halo.
  const asDone = complete && !celebrating
  const time = lastAt ? clockOf(lastAt) : null

  return (
    <div
      className={`hab-row hab-row--split${asDone ? ' hab-row--muted' : ''}`}
      data-color={habitColor(habit)}
    >
      <Link className="hab-row__body" to={to}>
        <HabitIcon habit={habit} />
        <span className={`hab-row__main${multi ? ' hab-row__main--wide' : ''}`}>
          <span className="hab-row__title">{habit.title}</span>
          <HabitTodayRowSub
            habit={habit}
            progress={progress}
            asDone={asDone}
            celebrating={celebrating}
            streak={streak}
            time={time}
          />
        </span>
      </Link>
      <button
        type="button"
        className={`hab-control hab-control--${controlVariant(complete, multi)}${
          celebrating ? ' is-celebrating' : ''
        }`}
        aria-pressed={complete}
        aria-label={`${complete ? 'Desmarcar' : 'Marcar'} hoy: ${habit.title}`}
        onClick={onToggle}
      >
        <ControlGlyph complete={complete} multi={multi} />
      </button>
    </div>
  )
}

/** Fila de un hábito saltado hoy: atenuada y con "Deshacer" a la derecha. */
export function HabitSkippedRow({
  habit,
  to,
  onUndo,
}: Readonly<{
  habit: Habit
  to: string
  onUndo: () => void
}>) {
  return (
    <div className="hab-row hab-row--split hab-row--dim" data-color={habitColor(habit)}>
      <Link className="hab-row__body" to={to}>
        <HabitIcon habit={habit} />
        <span className="hab-row__main">
          <span className="hab-row__title">{habit.title}</span>
          <span className="hab-row__sub">Saltado hoy</span>
        </span>
      </Link>
      <button
        type="button"
        className="hab-textaction"
        aria-label={`Deshacer el salto de hoy: ${habit.title}`}
        onClick={onUndo}
      >
        Deshacer
      </button>
    </div>
  )
}

/* ===== Pestaña Todos ====================================================== */

/** Fila de "Todos": toda la fila navega al detalle. */
export function HabitAllRow({
  habit,
  to,
  streak,
  today,
}: Readonly<{
  habit: Habit
  to: string
  streak: number
  today: string
}>) {
  const paused = habit.pausedUntil !== null && today <= habit.pausedUntil
  const pieces: ReactNode[] = []
  if (habitTarget(habit) > 1) pieces.push(timesLabel(habit))
  pieces.push(daysLabel(habit.weekdays))

  return (
    <Link className="hab-row" to={to} data-color={habitColor(habit)}>
      <HabitIcon habit={habit} />
      <span className="hab-row__main">
        <span className="hab-row__title">{habit.title}</span>
        <span className="hab-row__sub">
          {paused ? (
            `Pausado hasta ${shortDate(habit.pausedUntil as string)}`
          ) : (
            <>
              {pieces.join(' · ')}
              {streak > 0 && <StreakTail streak={streak} />}
            </>
          )}
        </span>
      </span>
      <span className="hab-row__chevron" aria-hidden="true">
        <IconChevronRight size={16} />
      </span>
    </Link>
  )
}

/* ===== Pestaña Archivados ================================================= */

export function HabitArchivedRow({
  habit,
  caption,
  onRestore,
}: Readonly<{
  habit: Habit
  caption: string
  onRestore: () => void
}>) {
  return (
    <div className="hab-row hab-row--muted">
      <span className="hab-archived-icon">
        <HabitIcon habit={habit} />
      </span>
      <span className="hab-row__main">
        <span className="hab-row__title">{habit.title}</span>
        <span className="hab-row__sub hab-row__sub--wrap">{caption}</span>
      </span>
      <button
        type="button"
        className="hab-pill"
        aria-label={`Reactivar el hábito: ${habit.title}`}
        onClick={onRestore}
      >
        Reactivar
      </button>
    </div>
  )
}

/* ===== Primer uso ========================================================= */

/** Sugerencia del primer uso: toda la fila abre la hoja ya precargada. */
export function HabitSuggestionRow({
  suggestion,
  onPick,
}: Readonly<{
  suggestion: HabitSuggestion
  onPick: () => void
}>) {
  const parts: string[] = []
  if (suggestion.timesPerDay > 1) {
    parts.push(`${suggestion.timesPerDay} ${suggestion.unit ?? 'veces'}`)
  }
  parts.push(daysLabel(suggestion.weekdays))

  return (
    <button
      type="button"
      className="hab-row"
      aria-label={`Crear el hábito: ${suggestion.title}`}
      onClick={onPick}
    >
      <HabitIcon icon={suggestion.icon} color={suggestion.color} />
      <span className="hab-row__main">
        <span className="hab-row__title">{suggestion.title}</span>
        <span className="hab-row__sub">{parts.join(' · ')}</span>
      </span>
      <span className="hab-add-glyph" aria-hidden="true">
        <IconPlus size={18} />
      </span>
    </button>
  )
}
