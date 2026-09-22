import { useCallback, useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useParams, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useToast, type ToastTone } from '@/app/toast'
import {
  listHabitChecksInRange,
  listHabitSkipsInRange,
  listHabits,
  setHabitArchived,
  setHabitPausedUntil,
  setHabitSkipped,
} from '@/services/habits'
import { listGoals } from '@/services/goals'
import {
  daysLabel,
  frequencyLabel,
  habitAppliesOn,
  habitBestStreak,
  habitColor,
  habitDayProgress,
  habitMonthGrid,
  habitMonthStats,
  habitStreakOf,
  habitTarget,
  remindersLabel,
  skipSetOf,
  type HabitCellState,
} from '@/domain/habits'
import { isGoalClosed } from '@/domain/goals'
import { getNiche } from '@/domain/niches'
import {
  addDays,
  addMonths,
  formatLongDate,
  formatMonthYear,
  parseISO,
  startOfMonth,
  todayISO,
} from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import type { Goal, Habit, HabitCheck, HabitSkip } from '@/lib/types'
import { HabitIcon } from '@/components/HabitIcon'
import { LoadingScreen } from '@/components/LoadingScreen'
import { IconChevronLeft, IconChevronRight, IconFlame } from '@/components/icons'
import { HabitSheet } from '@/screens/habits/HabitSheet'
import { draftFromHabit } from '@/screens/habits/habitDraft'
import '@/styles/habits.css'
import '@/styles/habit-detail.css'

/**
 * Detalle de un hábito (`/habitos/:habitId`).
 *
 * Es la ficha completa: identidad, cómo va (racha, mejor racha, mes en
 * cuadrícula), cómo está configurado (filas que abren la hoja en el paso que
 * toca) y qué se puede hacer con él (saltar hoy, pausar, archivar).
 *
 * La pantalla trae su propia cabecera "‹ Hábitos / Editar", así que el
 * AppShell no monta la TopBar aquí (§8 del diseño).
 */

/** Meses hacia atrás que se pueden mirar en la cuadrícula. */
const MONTHS_BACK = 12
/** Ventana de historial que se descarga (cubre el mes más antiguo navegable). */
const STREAK_DAYS = 365

const DAY_MONTH = new Intl.DateTimeFormat('es', { day: 'numeric', month: 'short' })
const MONTH_ONLY = new Intl.DateTimeFormat('es', { month: 'long' })

/** "30 sept" — para el chip de pausa y los textos de acción. */
function shortDate(dateISO: string): string {
  return DAY_MONTH.format(parseISO(dateISO)).replace('.', '')
}

/** "Septiembre" en el año en curso; "Septiembre de 2025" en los anteriores. */
function monthTitleOf(monthISO: string, today: string): string {
  if (monthISO.slice(0, 4) !== today.slice(0, 4)) return formatMonthYear(monthISO)
  const name = MONTH_ONLY.format(parseISO(monthISO))
  return name.charAt(0).toUpperCase() + name.slice(1)
}

/** Qué cuenta la celda del mes al pasar el puntero (y en el título de la celda). */
const CELL_LABEL: Record<HabitCellState, string> = {
  done: 'hecho',
  partial: 'a medias',
  missed: 'sin marcar',
  free: 'no tocaba',
  skipped: 'saltado',
  future: 'por venir',
  blank: '',
}

/**
 * Mensaje de una acción que falló. Si el servicio avisó que falta la migración
 * (`code: 'missing-column'`) mostramos su texto tal cual: es el único caso en
 * que el error técnico ya viene escrito para el usuario.
 */
function actionError(err: unknown, fallback: string): string {
  if (err instanceof Error && (err as Error & { code?: string }).code === 'missing-column') {
    return err.message
  }
  return friendlyError(err, fallback)
}

/** Frecuencia tal como se lee en el héroe: "5 vasos", "5 veces al día". */
function frequencyWithUnit(habit: Habit): string | null {
  const target = habitTarget(habit)
  // Una vez al día no aporta nada al subtítulo (ya está en la fila Frecuencia).
  if (target <= 1) return null
  return habit.unit && habit.unit.length > 0 ? `${target} ${habit.unit}` : frequencyLabel(habit)
}

/** Pestaña de origen, para que "‹ Hábitos" vuelva a donde estabas. */
const TABS = new Set(['hoy', 'todos', 'archivados'])

type ToastFn = (message: string, tone?: ToastTone) => void

/**
 * Aplica un cambio optimista y lo revierte si la llamada al servicio falla.
 * Vive fuera del componente (toast y los callbacks llegan como parámetros)
 * para no sumarle a HabitDetail la complejidad de su propio try/catch.
 */
async function runAction(
  toast: ToastFn,
  apply: () => void,
  revert: () => void,
  call: () => Promise<void>,
  ok: string,
  fallback: string,
): Promise<void> {
  apply()
  try {
    await call()
    toast(ok)
  } catch (e: unknown) {
    revert()
    toast(actionError(e, fallback), 'warning')
  }
}

/** Los saltos con el de hoy puesto o quitado, según toque. */
function withSkipToggle(
  skips: HabitSkip[],
  habitId: string,
  date: string,
  on: boolean,
): HabitSkip[] {
  return on ? [...skips, { habitId, date }] : skips.filter((s) => s.date !== date)
}

/** "Hoy no cuenta para este hábito." / "Salto deshecho.". */
function skipToggleMessage(on: boolean): string {
  return on ? 'Hoy no cuenta para este hábito.' : 'Salto deshecho.'
}

/** "Pausado hasta el 30 sept." / "Hábito reanudado.". */
function pauseMessage(dateISO: string | null): string {
  return dateISO ? `Pausado hasta el ${shortDate(dateISO)}.` : 'Hábito reanudado.'
}

/** `archivedAt` que corresponde al nuevo estado (archivar vs. reactivar). */
function archivedAtFor(archive: boolean): string | null {
  return archive ? new Date().toISOString() : null
}

/** "Hábito archivado." / "Hábito reactivado.". */
function archiveMessage(archive: boolean): string {
  return archive ? 'Hábito archivado.' : 'Hábito reactivado.'
}

/** Mensaje de error de archivar/reactivar. */
function archiveErrorMessage(archive: boolean): string {
  return archive ? 'No se pudo archivar el hábito.' : 'No se pudo reactivar el hábito.'
}

export function HabitDetail() {
  const { habitId } = useParams<{ habitId: string }>()
  const { userId } = useSession()
  const { toast } = useToast()
  const location = useLocation()
  const [params] = useSearchParams()

  const today = todayISO()

  const [habit, setHabit] = useState<Habit | null>(null)
  const [checks, setChecks] = useState<HabitCheck[]>([])
  const [skips, setSkips] = useState<HabitSkip[]>([])
  const [goals, setGoals] = useState<Goal[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [month, setMonth] = useState(() => startOfMonth(today))
  const [sheetStep, setSheetStep] = useState<1 | 2 | 3 | null>(null)
  const [pauseOpen, setPauseOpen] = useState(false)

  // Volver a la lista conservando la pestaña de origen (state o ?tab).
  const rawTab = (location.state as { tab?: string } | null)?.tab ?? params.get('tab')
  const tab = rawTab && TABS.has(rawTab) ? rawTab : null
  const backTo = tab ? `/habitos?tab=${tab}` : '/habitos'

  useEffect(() => {
    if (!habitId) return
    let active = true
    setLoading(true)
    // El historial arranca en el primer día del mes más antiguo navegable, para
    // que esa cuadrícula esté completa; la racha mira solo los últimos 365 días.
    const from = startOfMonth(addMonths(today, -MONTHS_BACK))
    Promise.all([
      listHabits(userId),
      listHabitChecksInRange(userId, from, today),
      listHabitSkipsInRange(userId, from, today),
      listGoals(userId),
    ])
      .then(([hs, cs, sks, gs]) => {
        if (!active) return
        setHabit(hs.find((h) => h.id === habitId) ?? null)
        setChecks(cs.filter((c) => c.habitId === habitId))
        setSkips(sks.filter((s) => s.habitId === habitId))
        setGoals(gs)
        setError(null)
      })
      .catch((e: unknown) => {
        if (active) setError(friendlyError(e, 'No se pudo cargar el hábito.'))
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [habitId, userId, today])

  const skipSet = useMemo(() => skipSetOf(skips), [skips])

  const openSheet = useCallback((step: 1 | 2 | 3) => {
    setPauseOpen(false)
    setSheetStep(step)
  }, [])

  if (loading) return <LoadingScreen />
  if (error && !habit) return <LoadingScreen error={error} />
  if (!habit) {
    return (
      <div className="screen hdet hdet--empty">
        <p className="hdet-missing__title">Ese hábito ya no existe</p>
        <p className="hdet-missing__text">
          Puede que lo hayas borrado desde otro dispositivo.
        </p>
        <Link className="btn btn--ghost" to="/habitos">
          Ir a Hábitos
        </Link>
      </div>
    )
  }

  // Alias ya sin null: los handlers de abajo son cierres y TS no arrastra ahí
  // el estrechamiento del `if (!habit)`.
  const current: Habit = habit

  const active = habit.archivedAt === null
  const paused = habit.pausedUntil !== null && today <= habit.pausedUntil
  const skippedToday = skips.some((s) => s.date === today)
  const progress = habitDayProgress(habit, checks, today)
  const canSkipToday =
    active && !skippedToday && habitAppliesOn(habit, today, skipSet) && !progress.complete

  const streak = habitStreakOf(habit, checks, skipSet, today)
  const best = habitBestStreak(habit, checks, skipSet, addDays(today, -(STREAK_DAYS - 1)), today)
  const monthNow = habitMonthStats(habit, checks, skipSet, startOfMonth(today), today)
  const stats = habitMonthStats(habit, checks, skipSet, month, today)
  const grid = habitMonthGrid(habit, checks, skipSet, month, today)
  const monthTitle = monthTitleOf(month, today)

  const firstMonth = startOfMonth(addMonths(today, -MONTHS_BACK))
  const lastMonth = startOfMonth(today)

  const goal = habit.goalId ? (goals.find((g) => g.id === habit.goalId) ?? null) : null
  const activeGoals = goals.filter((g) => !isGoalClosed(g.status))

  const days = daysLabel(habit.weekdays)
  const frequency = frequencyWithUnit(habit)
  const subtitle = [frequency, days, getNiche(habit.area).label].filter(Boolean).join(' · ')

  function toggleSkipToday() {
    const id = current.id
    const next = !skippedToday
    const before = skips
    void runAction(
      toast,
      () => setSkips(withSkipToggle(before, id, today, next)),
      () => setSkips(before),
      () => setHabitSkipped(userId, id, today, next),
      skipToggleMessage(next),
      'No se pudo guardar el salto.',
    )
  }

  function pauseUntil(dateISO: string | null) {
    const before = current
    setPauseOpen(false)
    void runAction(
      toast,
      () => setHabit({ ...before, pausedUntil: dateISO }),
      () => setHabit(before),
      async () => {
        setHabit(await setHabitPausedUntil(before.id, dateISO))
      },
      pauseMessage(dateISO),
      'No se pudo pausar el hábito.',
    )
  }

  function toggleArchive() {
    const before = current
    const archive = before.archivedAt === null
    void runAction(
      toast,
      () => setHabit({ ...before, archivedAt: archivedAtFor(archive) }),
      () => setHabit(before),
      async () => {
        setHabit(await setHabitArchived(before.id, archive))
      },
      archiveMessage(archive),
      archiveErrorMessage(archive),
    )
  }

  return (
    <div className="screen hdet" data-color={habitColor(habit)}>
      <header className="hdet-nav">
        <Link className="hdet-nav__back" to={backTo}>
          <IconChevronLeft size={18} />
          Hábitos
        </Link>
        <button type="button" className="hdet-nav__edit" onClick={() => openSheet(1)}>
          Editar
        </button>
      </header>

      <div className="hdet-hero">
        <HabitIcon habit={habit} size="lg" />
        <div className="hdet-hero__text">
          <h1 className="hdet-hero__title">{habit.title}</h1>
          <p className="hdet-hero__sub">{subtitle}</p>
          {(paused || !active) && (
            <p className="hdet-chips">
              {paused && habit.pausedUntil && (
                <span className="hdet-chip">Pausado hasta {shortDate(habit.pausedUntil)}</span>
              )}
              {!active && <span className="hdet-chip">Archivado</span>}
            </p>
          )}
        </div>
      </div>

      <div className="hdet-stats">
        <div className="hdet-stat">
          <span className="hdet-stat__label">Racha</span>
          <span className="hdet-stat__value hdet-stat__value--accent">
            <IconFlame size={16} />
            {streak}
          </span>
        </div>
        <div className="hdet-stat">
          <span className="hdet-stat__label">Mejor racha</span>
          <span className="hdet-stat__value">{best}</span>
        </div>
        <div className="hdet-stat">
          <span className="hdet-stat__label">Este mes</span>
          <span className="hdet-stat__value">
            {Math.round(monthNow.ratio * 100)}
            <span className="hdet-stat__unit"> %</span>
          </span>
        </div>
      </div>

      <section className="hdet-month">
        <div className="hdet-month__head">
          <div className="hdet-month__title">
            <button
              type="button"
              className="hdet-month__arrow"
              onClick={() => setMonth(addMonths(month, -1))}
              disabled={month <= firstMonth}
              aria-label="Mes anterior"
            >
              <IconChevronLeft size={14} />
            </button>
            <h2 className="hdet-month__name">{monthTitle}</h2>
            <button
              type="button"
              className="hdet-month__arrow"
              onClick={() => setMonth(addMonths(month, 1))}
              disabled={month >= lastMonth}
              aria-label="Mes siguiente"
            >
              <IconChevronRight size={14} />
            </button>
          </div>
          <span className="hdet-month__count">
            {stats.done} de {stats.applicable} días
          </span>
        </div>
        <div className="hdet-month__dow" aria-hidden="true">
          {['L', 'M', 'X', 'J', 'V', 'S', 'D'].map((d, i) => (
            <span key={`${d}-${i}`}>{d}</span>
          ))}
        </div>
        <div
          className="hdet-month__grid"
          role="img"
          aria-label={`${monthTitle}: ${stats.done} de ${stats.applicable} días hechos.`}
        >
          {grid.map((cell, i) => (
            <span
              key={cell.date ?? `hueco-${i}`}
              className="hdet-cell"
              data-state={cell.state}
              title={cell.date ? `${formatLongDate(cell.date)} · ${CELL_LABEL[cell.state]}` : undefined}
            />
          ))}
        </div>
      </section>

      <div className="hab-settings">
        <button type="button" className="hab-settings__row" onClick={() => openSheet(2)}>
          <span>Frecuencia</span>
          <span className="hab-settings__value">{frequencyLabel(habit)}</span>
          <span className="hab-settings__chevron">
            <IconChevronRight size={14} />
          </span>
        </button>
        <button type="button" className="hab-settings__row" onClick={() => openSheet(2)}>
          <span>Días</span>
          <span className="hab-settings__value">{days === 'Todos los días' ? 'Todos' : days}</span>
          <span className="hab-settings__chevron">
            <IconChevronRight size={14} />
          </span>
        </button>
        <button type="button" className="hab-settings__row" onClick={() => openSheet(2)}>
          <span>Recordatorios</span>
          <span className="hab-settings__value">{remindersLabel(habit.times)}</span>
          <span className="hab-settings__chevron">
            <IconChevronRight size={14} />
          </span>
        </button>
        <button type="button" className="hab-settings__row" onClick={() => openSheet(3)}>
          <span>Meta vinculada</span>
          <span className="hab-settings__value">{goal ? goal.title : 'Ninguna'}</span>
          <span className="hab-settings__chevron">
            <IconChevronRight size={14} />
          </span>
        </button>
      </div>

      <div className="hdet-actions">
        {active && (canSkipToday || skippedToday) && (
          <button type="button" className="hdet-action" onClick={toggleSkipToday}>
            {skippedToday ? 'Deshacer salto de hoy' : 'Saltar hoy'}
          </button>
        )}
        {active && (
          <button
            type="button"
            className="hdet-action"
            onClick={() => (paused ? pauseUntil(null) : setPauseOpen(!pauseOpen))}
            aria-expanded={paused ? undefined : pauseOpen}
          >
            {paused ? 'Reanudar ahora' : 'Pausar hasta…'}
          </button>
        )}
        {active && !paused && pauseOpen && (
          <div className="hdet-pause">
            <button type="button" className="hdet-pause__opt" onClick={() => pauseUntil(today)}>
              Mañana
            </button>
            <button
              type="button"
              className="hdet-pause__opt"
              onClick={() => pauseUntil(addDays(today, 2))}
            >
              3 días
            </button>
            <button
              type="button"
              className="hdet-pause__opt"
              onClick={() => pauseUntil(addDays(today, 6))}
            >
              1 semana
            </button>
            <label className="hdet-pause__pick">
              <span>Elegir fecha</span>
              <input
                type="date"
                min={today}
                onChange={(e) => {
                  if (e.target.value) pauseUntil(e.target.value)
                }}
              />
            </label>
          </div>
        )}
        <button type="button" className="hdet-action hdet-action--danger" onClick={toggleArchive}>
          {active ? 'Archivar hábito' : 'Reactivar hábito'}
        </button>
      </div>

      {/* La hoja cierra sola tras guardar (llama a onClose): onSaved solo
          reemplaza el hábito para que el detalle refleje el cambio. */}
      {sheetStep !== null && (
        <HabitSheet
          mode="edit"
          habitId={habit.id}
          initial={draftFromHabit(habit)}
          initialStep={sheetStep}
          goals={activeGoals}
          userId={userId}
          onSaved={setHabit}
          onClose={() => setSheetStep(null)}
        />
      )}
    </div>
  )
}
