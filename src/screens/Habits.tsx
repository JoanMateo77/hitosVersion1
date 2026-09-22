import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type ReactNode,
} from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import type { Goal, Habit, HabitCheck, HabitSkip, NicheId } from '@/lib/types'
import { listGoals } from '@/services/goals'
import {
  listHabitChecksInRange,
  listHabitSkipsInRange,
  listHabits,
  setHabitArchived,
  setHabitCheck,
  setHabitSkipped,
} from '@/services/habits'
import {
  archivedCaption,
  groupHabitsByArea,
  habitAppliesOn,
  habitBestStreak,
  habitDayProgress,
  habitDoneCount,
  habitStreakOf,
  habitTarget,
  habitTogglePlan,
  habitsDayStreak,
  habitsDueOn,
  HABIT_SUGGESTIONS,
  skipKey,
  skipSetOf,
  todayHeadline,
  weekRings,
  type HabitSuggestion,
} from '@/domain/habits'
import { NICHES } from '@/domain/niches'
import { WEEKDAY_LABELS } from '@/domain/commitment'
import { addDays, dayOfMonth, endOfWeek, parseISO, startOfWeek, todayISO } from '@/lib/date'
import { friendlyError } from '@/lib/errors'
import { tapHaptic } from '@/lib/haptics'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint'
import { HabitIcon } from '@/components/HabitIcon'
import { SkeletonList } from '@/components/Skeleton'
import {
  IconArchive,
  IconChevronLeft,
  IconFlame,
  IconPlus,
  IconSkipForward,
} from '@/components/icons'
import {
  HabitAllRow,
  HabitArchivedRow,
  HabitSkippedRow,
  HabitSuggestionRow,
  HabitTodayRow,
} from '@/screens/habits/HabitListRow'
import { SwipeRow } from '@/screens/habits/SwipeRow'
import { HabitSheet } from '@/screens/habits/HabitSheet'
import { draftFromSuggestion, emptyDraft, type HabitDraft } from '@/screens/habits/habitDraft'
import '@/styles/habits.css'

/**
 * Pantalla Hábitos (/habitos): tres pestañas sobre los mismos datos.
 *
 * - **Hoy**: la semana en anillos y las filas que tocan hoy, con un control de
 *   un toque a la derecha y el gesto de deslizar (saltar hoy / archivar).
 * - **Todos**: el mapa completo por área; cada fila lleva al detalle.
 * - **Archivados**: lo que se guardó con su historial, listo para reactivar.
 *
 * Sin hábitos activos la pantalla es el primer uso: hero + 4 sugerencias que
 * abren la hoja precargada (nada se crea sin confirmar). Todo lo que muta es
 * optimista y revierte con mensaje si el servidor falla.
 */

type Tab = 'hoy' | 'todos' | 'archivados'

const TABS: { id: Tab; label: string }[] = [
  { id: 'hoy', label: 'Hoy' },
  { id: 'todos', label: 'Todos' },
  { id: 'archivados', label: 'Archivados' },
]

/** Iniciales de la franja semanal, lunes primero (la X es el miércoles). */
const WEEK_LETTERS = ['L', 'M', 'X', 'J', 'V', 'S', 'D']

/** Días de checks que pedimos: alcanza para rachas largas y mejores rachas. */
const CHECK_HISTORY_DAYS = 365

/** Cuánto dura el festejo de "última repetición" (coincide con hab-halo). */
const CELEBRATE_MS = 1200

/** Cuánto se queda la tarjeta "Día completo" antes de irse sola. */
const DAY_DONE_MS = 6000

/** Sugerencias del primer uso (las 4 primeras del catálogo). */
const FIRST_SUGGESTIONS = HABIT_SUGGESTIONS.slice(0, 4)

/** Azulejos del hero de primer uso (los tres del mockup). */
const HERO_TILES = [
  { icon: '💧', color: 'cyan' },
  { icon: '📖', color: 'blue' },
  { icon: '🧘', color: 'yellow' },
] as const

/** Lista compartida para hábitos sin checks: evita crear una por render. */
const EMPTY_CHECKS: HabitCheck[] = []

const WEEKDAY_LONG = new Intl.DateTimeFormat('es', { weekday: 'long' })

/** "Lunes 21": el encabezado de la pestaña Hoy y del primer uso. */
function dayLabel(dateISO: string): string {
  const name = WEEKDAY_LONG.format(parseISO(dateISO))
  return `${name.charAt(0).toUpperCase()}${name.slice(1)} ${dayOfMonth(dateISO)}`
}

/** La pestaña vive en ?tab= para sobrevivir a ir y volver del detalle. */
function readTab(value: string | null): Tab {
  return TABS.some((t) => t.id === value) ? (value as Tab) : 'hoy'
}

/**
 * Mensaje de un fallo de acción. Si el servicio avisó que falta la migración
 * (`code: 'missing-column'`) mostramos SU texto: es el único caso en que el
 * mensaje crudo ya está escrito para el usuario.
 */
function actionMessage(err: unknown, fallback: string): string {
  if (err instanceof Error && (err as Error & { code?: string }).code === 'missing-column') {
    return err.message
  }
  return friendlyError(err, fallback)
}

/** Instantánea de datos cacheada por sesión para pintar la pantalla al instante. */
interface HabitsSnapshot {
  habits: Habit[]
  checks: HabitCheck[]
  skips: HabitSkip[]
  goals: Goal[]
}

/** Lo que la hoja necesita para abrirse (crear o editar). */
interface SheetState {
  mode: 'create' | 'edit'
  initial: HabitDraft
  step: 1 | 2 | 3
}

export function Habits() {
  const { userId } = useSession()
  const [params, setParams] = useSearchParams()
  const today = todayISO()
  const weekStart = startOfWeek(today)
  const historyFrom = addDays(today, -CHECK_HISTORY_DAYS)

  // --- Datos (cache de sesión: se pinta lo último y se revalida por detrás) ---
  const cacheKey = `habits:${userId}`
  const cached = sessionCache.get<HabitsSnapshot>(cacheKey)
  const [habits, setHabits] = useState<Habit[] | null>(cached?.habits ?? null)
  const [checks, setChecks] = useState<HabitCheck[]>(cached?.checks ?? [])
  const [skips, setSkips] = useState<HabitSkip[]>(cached?.skips ?? [])
  const [goals, setGoals] = useState<Goal[]>(cached?.goals ?? [])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const to = todayISO()
    Promise.all([
      listHabits(userId),
      listHabitChecksInRange(userId, addDays(to, -CHECK_HISTORY_DAYS), to),
      // Hasta el fin de la semana: los anillos miran también los días que faltan.
      listHabitSkipsInRange(userId, addDays(to, -CHECK_HISTORY_DAYS), endOfWeek(to)),
      listGoals(userId).catch(() => [] as Goal[]),
    ])
      .then(([loadedHabits, loadedChecks, loadedSkips, loadedGoals]) => {
        if (!active) return
        setHabits(loadedHabits)
        setChecks(loadedChecks)
        setSkips(loadedSkips)
        setGoals(loadedGoals)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(friendlyError(err, 'No se pudieron cargar tus hábitos.'))
      })
    return () => {
      active = false
    }
  }, [userId])

  useCacheMirror(cacheKey, habits !== null, {
    habits: habits ?? [],
    checks,
    skips,
    goals,
  })

  // --- Derivados ------------------------------------------------------------
  const skipSet = useMemo(() => skipSetOf(skips), [skips])
  const checksByHabit = useMemo(() => {
    const map = new Map<string, HabitCheck[]>()
    for (const check of checks) {
      const list = map.get(check.habitId)
      if (list) list.push(check)
      else map.set(check.habitId, [check])
    }
    return map
  }, [checks])

  const active = useMemo(() => (habits ?? []).filter((h) => h.archivedAt === null), [habits])
  const archived = useMemo(() => (habits ?? []).filter((h) => h.archivedAt !== null), [habits])
  const rings = useMemo(
    () => weekRings(active, checks, skipSet, weekStart, today),
    [active, checks, skipSet, weekStart, today],
  )
  const headline = todayHeadline(active, checks, skipSet, today)

  // --- Pestaña y hoja -------------------------------------------------------
  const tab = readTab(params.get('tab'))
  const firstRun = habits !== null && active.length === 0 && tab !== 'archivados'

  function selectTab(next: Tab) {
    const nextParams = new URLSearchParams(params)
    nextParams.set('tab', next)
    setParams(nextParams, { replace: true })
  }

  const [sheet, setSheet] = useState<SheetState | null>(null)

  // Deep-link ?nuevo=TITULO&area=AREA (lo usan Aprender y las ideas): abre la
  // hoja precargada y se consume, para que un cambio de pestaña no la reabra.
  useEffect(() => {
    const title = params.get('nuevo')
    if (title === null) return
    const areaParam = params.get('area')
    const area: NicheId = NICHES.some((n) => n.id === areaParam)
      ? (areaParam as NicheId)
      : 'otra'
    setSheet({ mode: 'create', initial: emptyDraft({ title, area }), step: 1 })
    const nextParams = new URLSearchParams(params)
    nextParams.delete('nuevo')
    nextParams.delete('area')
    setParams(nextParams, { replace: true })
  }, [params, setParams])

  function openSheet(initial: HabitDraft) {
    setSheet({ mode: 'create', initial, step: 1 })
  }

  function handleSaved(habit: Habit) {
    setHabits((prev) => {
      const list = prev ?? []
      return list.some((h) => h.id === habit.id)
        ? list.map((h) => (h.id === habit.id ? habit : h))
        : [...list, habit]
    })
    setSheet(null)
  }

  // --- Gesto: una sola fila abierta a la vez --------------------------------
  const [openRow, setOpenRow] = useState<string | null>(null)

  // --- Festejo de la última repetición --------------------------------------
  const [celebrateId, setCelebrateId] = useState<string | null>(null)
  const celebrateTimer = useRef<number | null>(null)
  useEffect(() => () => window.clearTimeout(celebrateTimer.current ?? undefined), [])

  function celebrate(habitId: string) {
    setCelebrateId(habitId)
    window.clearTimeout(celebrateTimer.current ?? undefined)
    celebrateTimer.current = window.setTimeout(() => {
      setCelebrateId(null)
      celebrateTimer.current = null
    }, CELEBRATE_MS)
  }

  // --- Micro-momento "Día completo" -----------------------------------------
  const dayComplete = headline.total > 0 && headline.done === headline.total
  const wasComplete = useRef<boolean | null>(null)
  const [dayDone, setDayDone] = useState(false)

  useEffect(() => {
    if (habits === null) return
    const previous = wasComplete.current
    wasComplete.current = dayComplete
    // Solo cuando el día PASA a completo en esta sesión (nunca al entrar).
    if (previous === false && dayComplete) setDayDone(true)
  }, [habits, dayComplete])

  const dayDoneRef = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    if (!dayDone) return
    const timer = window.setTimeout(() => setDayDone(false), DAY_DONE_MS)
    function close(event: PointerEvent) {
      if (dayDoneRef.current?.contains(event.target as Node)) return
      setDayDone(false)
    }
    document.addEventListener('pointerdown', close)
    return () => {
      window.clearTimeout(timer)
      document.removeEventListener('pointerdown', close)
    }
  }, [dayDone])

  // --- Acciones -------------------------------------------------------------
  function patchCheck(check: HabitCheck, add: boolean) {
    setChecks((prev) =>
      add
        ? [...prev, check]
        : prev.filter(
            (c) =>
              !(c.habitId === check.habitId && c.date === check.date && c.slot === check.slot),
          ),
    )
  }

  /**
   * Marca la siguiente repetición de hoy y, si el día ya está completo,
   * desmarca la última (la misma gramática de un toque que en Hoy).
   */
  async function toggleHabit(habit: Habit) {
    const own = checksByHabit.get(habit.id) ?? EMPTY_CHECKS
    const plan = habitTogglePlan(habit, own, today)
    const check: HabitCheck = {
      habitId: habit.id,
      date: today,
      slot: plan.slot,
      at: new Date().toISOString(),
    }
    setActionError(null)
    patchCheck(check, plan.add)
    if (plan.add) {
      tapHaptic()
      const target = habitTarget(habit)
      // El festejo es el de "completaste las repeticiones del día".
      if (target > 1 && habitDoneCount(own, habit.id, today) + 1 >= target) celebrate(habit.id)
    }
    try {
      await setHabitCheck(userId, habit.id, today, plan.add, plan.slot)
    } catch (err) {
      patchCheck(check, !plan.add)
      setActionError(friendlyError(err, 'No se pudo marcar el hábito.'))
    }
  }

  async function changeSkip(habit: Habit, skipped: boolean) {
    setActionError(null)
    setSkips((prev) =>
      skipped
        ? [...prev, { habitId: habit.id, date: today }]
        : prev.filter((s) => !(s.habitId === habit.id && s.date === today)),
    )
    try {
      await setHabitSkipped(userId, habit.id, today, skipped)
    } catch (err) {
      setSkips((prev) =>
        skipped
          ? prev.filter((s) => !(s.habitId === habit.id && s.date === today))
          : [...prev, { habitId: habit.id, date: today }],
      )
      setActionError(
        actionMessage(
          err,
          skipped ? 'No se pudo saltar el hábito por hoy.' : 'No se pudo deshacer el salto.',
        ),
      )
    }
  }

  async function changeArchived(habit: Habit, archive: boolean) {
    setActionError(null)
    const archivedAt = archive ? new Date().toISOString() : null
    setHabits((prev) => prev?.map((h) => (h.id === habit.id ? { ...h, archivedAt } : h)) ?? prev)
    try {
      const updated = await setHabitArchived(habit.id, archive)
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? updated : h)) ?? prev)
    } catch (err) {
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? habit : h)) ?? prev)
      setActionError(
        friendlyError(
          err,
          archive ? 'No se pudo archivar el hábito.' : 'No se pudo reactivar el hábito.',
        ),
      )
    }
  }

  // --- Listas de la pestaña Hoy ---------------------------------------------
  const dueToday = habitsDueOn(habits ?? [], today, skipSet)
  const progressOf = (habit: Habit) =>
    habitDayProgress(habit, checksByHabit.get(habit.id) ?? EMPTY_CHECKS, today)
  // El hábito que festeja se queda en "Por hacer" mientras dura el halo.
  const pending = dueToday.filter((h) => !progressOf(h).complete || h.id === celebrateId)
  const doneToday = dueToday.filter((h) => progressOf(h).complete && h.id !== celebrateId)
  const skippedToday = active.filter(
    (h) => skipSet.has(skipKey(h.id, today)) && habitAppliesOn(h, today),
  )

  const groups = groupHabitsByArea(active)
  const hint = useFirstTimeHint('habitos-deslizar')

  /** Racha del hábito con sus propios checks (más barato que filtrar todo). */
  function streakOf(habit: Habit): number {
    return habitStreakOf(habit, checksByHabit.get(habit.id) ?? EMPTY_CHECKS, skipSet, today)
  }

  /** Enlace al detalle conservando la pestaña actual. */
  function detailPath(habit: Habit): string {
    return `/habitos/${habit.id}?tab=${tab}`
  }

  /** Hora del último check de hoy, para la línea verde de "Hechos". */
  function lastCheckAt(habit: Habit): string | null {
    let latest: string | null = null
    for (const check of checksByHabit.get(habit.id) ?? EMPTY_CHECKS) {
      if (check.date !== today || !check.at) continue
      if (latest === null || check.at > latest) latest = check.at
    }
    return latest
  }

  // --- Subtítulo de la cabecera ---------------------------------------------
  let subtitle: ReactNode = dayLabel(today)
  if (!firstRun && tab === 'hoy') {
    subtitle = (
      <>
        {dayLabel(today)} ·{' '}
        <span className="hab-head__count">
          {headline.done} de {headline.total}
        </span>{' '}
        hechos
      </>
    )
  } else if (!firstRun && tab === 'todos') {
    subtitle = `${active.length} ${active.length === 1 ? 'activo' : 'activos'} · ${groups.length} ${
      groups.length === 1 ? 'área' : 'áreas'
    }`
  } else if (!firstRun && tab === 'archivados') {
    subtitle =
      archived.length === 0
        ? 'Ningún archivado'
        : `${archived.length} ${archived.length === 1 ? 'archivado' : 'archivados'}`
  }

  return (
    <div className="screen hab-screen">
      <header className="hab-head">
        <div className="hab-head__text">
          <h1 className="hab-head__title">Hábitos</h1>
          <span className="hab-head__sub">{subtitle}</span>
        </div>
        <button
          type="button"
          className="hab-head__add"
          aria-label="Nuevo hábito"
          onClick={() => openSheet(emptyDraft())}
        >
          <IconPlus size={20} />
        </button>
      </header>

      {loadError && <div className="alert alert--warn">{loadError}</div>}
      {actionError && (
        <div className="alert alert--warn" role="status" aria-live="polite">
          {actionError}
        </div>
      )}

      {habits !== null && !firstRun && (
        <div className="hab-seg" role="group" aria-label="Vista de hábitos">
          {TABS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={tab === option.id}
              className={`hab-seg__opt${tab === option.id ? ' is-on' : ''}`}
              onClick={() => selectTab(option.id)}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {habits === null && !loadError && <SkeletonList rows={4} />}

      {firstRun && (
        <>
          <div className="hab-first">
            <div className="hab-first__tiles" aria-hidden="true">
              {HERO_TILES.map((tile) => (
                <span key={tile.icon} className="hab-first__tile">
                  <HabitIcon icon={tile.icon} color={tile.color} size="lg" />
                </span>
              ))}
            </div>
            <p className="hab-first__title">Tu primer hábito</p>
            <p className="hab-first__text">
              Algo pequeño que puedas hacer todos los días. Elige uno para empezar o crea el tuyo
              con el +.
            </p>
          </div>
          <section className="hab-section" aria-label="Sugerencias">
            <span className="hab-kicker">Sugerencias</span>
            <ul className="hab-list">
              {FIRST_SUGGESTIONS.map((suggestion: HabitSuggestion) => (
                <li key={suggestion.title} className="hab-list__item">
                  <HabitSuggestionRow
                    suggestion={suggestion}
                    onPick={() => openSheet(draftFromSuggestion(suggestion))}
                  />
                </li>
              ))}
            </ul>
          </section>
          {archived.length > 0 && (
            <button
              type="button"
              className="hab-first__link"
              onClick={() => selectTab('archivados')}
            >
              Ver archivados ({archived.length})
            </button>
          )}
        </>
      )}

      {habits !== null && !firstRun && tab === 'hoy' && (
        <>
          {hint.visible && pending.length > 0 && (
            <div className="hab-hint" role="status">
              <span className="hab-hint__icon" aria-hidden="true">
                <IconChevronLeft size={16} />
              </span>
              <span className="hab-hint__text">
                Desliza una fila a la izquierda para saltar hoy o archivar.
              </span>
              <button type="button" className="hab-hint__done" onClick={hint.dismiss}>
                Entendido
              </button>
            </div>
          )}

          <div className="hab-week" role="group" aria-label="Tu semana">
            {rings.map((ring, i) => (
              <div key={ring.date} className="hab-week__day">
                <span
                  className={`hab-week__label${ring.phase === 'today' ? ' is-today' : ''}`}
                  aria-hidden="true"
                >
                  {WEEK_LETTERS[i]}
                </span>
                <span
                  role="img"
                  className={`hab-ring${ring.phase === 'future' ? ' hab-ring--future' : ''}`}
                  style={{ '--hab-ratio': `${Math.round(ring.ratio * 100)}%` } as CSSProperties}
                  aria-label={
                    ring.phase === 'future'
                      ? `${WEEKDAY_LABELS[i]}: todavía no llega`
                      : `${WEEKDAY_LABELS[i]}: ${Math.round(ring.ratio * 100)} % de tus hábitos`
                  }
                />
              </div>
            ))}
          </div>

          {pending.length > 0 && (
            <section className="hab-section" aria-label="Por hacer">
              <span className="hab-kicker">Por hacer · {pending.length}</span>
              <ul className="hab-list">
                {pending.map((habit) => (
                  <li key={habit.id} className="hab-list__item">
                    <SwipeRow
                      open={openRow === habit.id}
                      onOpenChange={(next) => setOpenRow(next ? habit.id : null)}
                      onComplete={() => void toggleHabit(habit)}
                      actions={[
                        {
                          key: 'skip',
                          label: 'Saltar hoy',
                          icon: <IconSkipForward size={20} />,
                          onAction: () => void changeSkip(habit, true),
                        },
                        {
                          key: 'archive',
                          label: 'Archivar',
                          tone: 'danger',
                          icon: <IconArchive size={20} />,
                          onAction: () => void changeArchived(habit, true),
                        },
                      ]}
                    >
                      <HabitTodayRow
                        habit={habit}
                        to={detailPath(habit)}
                        progress={progressOf(habit)}
                        streak={streakOf(habit)}
                        lastAt={lastCheckAt(habit)}
                        celebrating={celebrateId === habit.id}
                        onToggle={() => void toggleHabit(habit)}
                      />
                    </SwipeRow>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {doneToday.length > 0 && (
            <section className="hab-section" aria-label="Hechos">
              <span className="hab-kicker">Hechos · {doneToday.length}</span>
              <ul className="hab-list">
                {doneToday.map((habit) => (
                  <li key={habit.id} className="hab-list__item">
                    <HabitTodayRow
                      habit={habit}
                      to={detailPath(habit)}
                      progress={progressOf(habit)}
                      streak={streakOf(habit)}
                      lastAt={lastCheckAt(habit)}
                      celebrating={false}
                      onToggle={() => void toggleHabit(habit)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {skippedToday.length > 0 && (
            <section className="hab-section" aria-label="Saltados hoy">
              <span className="hab-kicker">Saltados hoy · {skippedToday.length}</span>
              <ul className="hab-list">
                {skippedToday.map((habit) => (
                  <li key={habit.id} className="hab-list__item">
                    <HabitSkippedRow
                      habit={habit}
                      to={detailPath(habit)}
                      onUndo={() => void changeSkip(habit, false)}
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {pending.length === 0 && doneToday.length === 0 && skippedToday.length === 0 && (
            <div className="hab-card">
              <div className="hab-blank">
                <p className="hab-blank__title">Hoy no toca ninguno</p>
                <p className="hab-blank__text">Mira Todos para ver tu semana.</p>
              </div>
            </div>
          )}
        </>
      )}

      {habits !== null && !firstRun && tab === 'todos' &&
        groups.map((group) => (
          <section key={group.area} className="hab-section" aria-label={group.label}>
            <span className="hab-kicker">{group.label}</span>
            <ul className="hab-list">
              {group.habits.map((habit) => (
                <li key={habit.id} className="hab-list__item">
                  <HabitAllRow
                    habit={habit}
                    to={detailPath(habit)}
                    streak={streakOf(habit)}
                    today={today}
                  />
                </li>
              ))}
            </ul>
          </section>
        ))}

      {habits !== null && tab === 'archivados' && (
        <>
          {archived.length === 0 ? (
            <div className="hab-empty">
              <span className="hab-empty__icon" aria-hidden="true">
                <IconArchive size={28} />
              </span>
              <p className="hab-empty__title">Nada archivado</p>
              <p className="hab-empty__text">
                Cuando un hábito ya no encaje, deslízalo a la izquierda y elige Archivar. Se guarda
                aquí con su historial.
              </p>
            </div>
          ) : (
            <>
              <ul className="hab-list">
                {archived.map((habit) => (
                  <li key={habit.id} className="hab-list__item">
                    <HabitArchivedRow
                      habit={habit}
                      caption={archivedCaption(
                        habit,
                        habitBestStreak(
                          habit,
                          checksByHabit.get(habit.id) ?? EMPTY_CHECKS,
                          skipSet,
                          historyFrom,
                          today,
                        ),
                        today,
                      )}
                      onRestore={() => void changeArchived(habit, false)}
                    />
                  </li>
                ))}
              </ul>
              <p className="hab-note">
                Los archivados no cuentan para la racha ni aparecen en Hoy. Su historial se
                conserva.
              </p>
            </>
          )}
          {active.length === 0 && (
            <button type="button" className="hab-first__link" onClick={() => selectTab('hoy')}>
              Volver a las sugerencias
            </button>
          )}
        </>
      )}

      {dayDone && (
        <div className="hab-toast" role="status" ref={dayDoneRef}>
          <span className="hab-toast__icon" aria-hidden="true">
            <IconFlame size={22} />
          </span>
          <span className="hab-toast__text">
            <span className="hab-toast__title">Día completo</span>
            <span className="hab-toast__sub">
              {headline.done} de {headline.total} hábitos · racha de{' '}
              {habitsDayStreak(active, checks, skipSet, today)} días
            </span>
          </span>
          <Link className="hab-toast__action" to="/progreso">
            Ver
          </Link>
        </div>
      )}

      {sheet && (
        <HabitSheet
          mode={sheet.mode}
          initial={sheet.initial}
          initialStep={sheet.step}
          goals={goals.filter((g) => g.status === 'active')}
          userId={userId}
          onSaved={handleSaved}
          onClose={() => setSheet(null)}
        />
      )}
    </div>
  )
}
