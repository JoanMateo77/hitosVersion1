import { useEffect, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useSession } from '@/app/session'
import { useToast } from '@/app/toast'
import type { Goal, Habit, HabitCheck, NicheId } from '@/lib/types'
import { listGoals } from '@/services/goals'
import {
  createHabit,
  listHabitChecksInRange,
  listHabits,
  setHabitArchived,
  setHabitCheck,
  updateHabit,
} from '@/services/habits'
import {
  habitAppliesOn,
  habitCompleteDates,
  habitDoneCount,
  habitStreak,
  habitTarget,
  habitWeek,
  nextSlot,
} from '@/domain/habits'
import { NICHES } from '@/domain/niches'
import { WEEKDAY_LABELS } from '@/domain/commitment'
import { addDays, formatTime12, startOfWeek, todayISO } from '@/lib/date'
import { nicheAccent } from '@/lib/nicheAccent'
import { friendlyError } from '@/lib/errors'
import { sessionCache } from '@/lib/sessionCache'
import { useCacheMirror } from '@/hooks/useCacheMirror'
import { NicheGlyph, NicheIcon } from '@/components/NicheGlyph'
import { SkeletonList } from '@/components/Skeleton'
import { IconArrowReturn, IconClose, IconDots, IconFlame, IconLightbulb, IconPlus } from '@/components/icons'

/** Mapa de estado de día → modificador de weekstrip (due se dibuja como "future":
 *  todavía se puede cumplir, igual que una sesión pendiente). */
const DOT_CLASS: Record<'done' | 'missed' | 'due' | 'free', string> = {
  done: 'done',
  missed: 'missed',
  due: 'future',
  free: 'free',
}

/** Hábitos listos para adoptar de un toque: precargan el formulario, no crean directo. */
const HABIT_IDEAS: { title: string; area: NicheId }[] = [
  { title: 'Beber 8 vasos de agua', area: 'salud' },
  { title: 'Leer 10 minutos', area: 'aprendizaje' },
  { title: 'Caminar 20 minutos', area: 'salud' },
  { title: 'Escribir 3 gratitudes', area: 'bienestar' },
  { title: 'Estirar al despertar', area: 'salud' },
  { title: 'Revisar gastos del día', area: 'finanzas' },
  { title: 'Llamar o escribir a alguien querido', area: 'relaciones' },
  { title: 'Dormir antes de las 11', area: 'bienestar' },
  { title: 'Practicar 15 minutos de un idioma', area: 'aprendizaje' },
  { title: 'Avanzar un poco en tu proyecto creativo', area: 'creatividad' },
]

/** Cuántos días de checks pedimos hacia atrás: suficiente para rachas largas. */
const CHECK_HISTORY_DAYS = 120

/** Lista compartida para hábitos sin checks: evita crear una por render. */
const EMPTY_CHECKS: HabitCheck[] = []

/** "Todos los días" o "Lu · Mi · Vi" — resumen humano de los días del hábito. */
function daysLabel(weekdays: number[]): string {
  if (weekdays.length === 0 || weekdays.length === 7) return 'Todos los días'
  return weekdays.map((d) => WEEKDAY_LABELS[d]).join(' · ')
}

/**
 * Pauta completa del hábito: días + horas. "Todos los días" como siempre si no
 * tiene horas; con horas suma "5 veces al día · 8:00 am – 8:00 pm" (o la hora
 * única si es una sola).
 */
function pautaLabel(habit: Habit): string {
  const base = daysLabel(habit.weekdays)
  const times = habit.times
  if (!times || times.length === 0) return base
  if (times.length === 1) return `${base} · ${formatTime12(times[0])}`
  return `${base} · ${times.length} veces al día · ${formatTime12(times[0])} – ${formatTime12(times[times.length - 1])}`
}

/** Horas listas para guardar: sin vacías y ordenadas ascendente; null si no hay. */
function cleanTimes(times: string[]): string[] | null {
  const clean = times.filter((t) => t.length > 0).sort((a, b) => a.localeCompare(b))
  return clean.length > 0 ? clean : null
}

/**
 * Editor de momentos del día: lista de horas, quitar, y "+ agregar otro
 * momento". Vacío = una vez al día sin hora fija (el comportamiento clásico).
 * Se usa igual al crear (estado local) y al editar (persiste cada cambio).
 */
function TimesEditor({ times, onChange }: { times: string[]; onChange: (t: string[]) => void }) {
  return (
    <div className="stack stack--sm">
      <span className="kicker">¿A qué horas?</span>
      {times.length === 0 ? (
        <p className="faint tiny" style={{ margin: 0 }}>
          Una vez al día, sin hora fija. Agrega momentos si quieres repetirlo o
          hacerlo a una hora concreta.
        </p>
      ) : (
        <>
          {times.map((t, i) => (
            <div key={i} className="row" style={{ alignItems: 'center' }}>
              <input
                className="input"
                type="time"
                value={t}
                aria-label={`Momento ${i + 1}`}
                onChange={(e) => onChange(times.map((x, j) => (j === i ? e.target.value : x)))}
              />
              <button
                type="button"
                className="iconbtn iconbtn--sm"
                style={{ flex: 'none' }}
                aria-label={`Quitar el momento ${i + 1}`}
                onClick={() => onChange(times.filter((_, j) => j !== i))}
              >
                <IconClose size={16} />
              </button>
            </div>
          ))}
          <p className="faint tiny" style={{ margin: 0 }}>
            {times.length === 1
              ? '1 vez al día. Cada momento que agregues es una repetición.'
              : `${times.length} veces al día: se cumple completando todas.`}
          </p>
        </>
      )}
      <button
        type="button"
        className="btn--link"
        style={{ alignSelf: 'flex-start' }}
        onClick={() => onChange([...times, ''])}
      >
        + agregar otro momento
      </button>
    </div>
  )
}

/** Instantánea de datos cacheada por sesión para pintar la pantalla al instante. */
type HabitsSnapshot = { habits: Habit[]; checksByHabit: Map<string, HabitCheck[]>; goals: Goal[] }

/**
 * Pantalla de hábitos: crear, ver la semana de cada uno, editar días y archivar.
 * Los que aplican HOY se pueden marcar aquí con el check redondo (misma gramática
 * de un toque que en Hoy), para que "Rutinas de un toque" cumpla su promesa.
 */
export function Habits() {
  const { userId } = useSession()
  const { toast } = useToast()
  const [params] = useSearchParams()
  const today = todayISO()
  const weekStart = startOfWeek(today)

  // --- Datos: hábitos + checks de los últimos 120 días (rachas y semana) ---
  // Cache de sesión: al volver, se pinta al instante lo último y se revalida por detrás.
  const cacheKey = `habits:${userId}`
  const cached = sessionCache.get<HabitsSnapshot>(cacheKey)
  const [habits, setHabits] = useState<Habit[] | null>(cached?.habits ?? null)
  const [checksByHabit, setChecksByHabit] = useState<Map<string, HabitCheck[]>>(
    cached?.checksByHabit ?? new Map(),
  )
  // Metas activas: para vincular un hábito a una meta (opcional).
  const [goals, setGoals] = useState<Goal[]>(cached?.goals ?? [])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [actionError, setActionError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    const to = todayISO()
    Promise.all([
      listHabits(userId),
      listHabitChecksInRange(userId, addDays(to, -CHECK_HISTORY_DAYS), to),
      listGoals(userId).catch(() => [] as Goal[]),
    ])
      .then(([loaded, checks, loadedGoals]) => {
        if (!active) return
        // Indexamos los checks por hábito una sola vez: racha, semana y slots
        // del día leen de aquí.
        const byHabit = new Map<string, HabitCheck[]>()
        for (const check of checks) {
          const list = byHabit.get(check.habitId) ?? []
          list.push(check)
          byHabit.set(check.habitId, list)
        }
        setHabits(loaded)
        setChecksByHabit(byHabit)
        setGoals(loadedGoals)
      })
      .catch((err: unknown) => {
        if (active) setLoadError(friendlyError(err, 'No se pudieron cargar tus hábitos.'))
      })
    return () => {
      active = false
    }
  }, [userId])

  // Mantiene el cache al día con lo que se muestra (incluidos los cambios optimistas).
  useCacheMirror(cacheKey, habits !== null, { habits: habits ?? [], checksByHabit, goals })

  const activeGoals = goals.filter((g) => g.status === 'active')
  const goalById = new Map(goals.map((g) => [g.id, g]))

  // --- Formulario de creación ---
  const [formOpen, setFormOpen] = useState(false)
  const [title, setTitle] = useState('')
  const [area, setArea] = useState<NicheId>('otra')
  const [days, setDays] = useState<number[]>([])
  const [formTimes, setFormTimes] = useState<string[]>([])
  const [goalId, setGoalId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState<string | null>(null)

  // Deep-link ?nuevo=TITULO&area=AREA (lo usan Aprender y las sugerencias):
  // abre el formulario ya precargado para que adoptar sea un toque.
  useEffect(() => {
    if (!params.has('nuevo')) return
    setTitle(params.get('nuevo') ?? '')
    const linkedArea = params.get('area')
    if (linkedArea && NICHES.some((n) => n.id === linkedArea)) setArea(linkedArea as NicheId)
    setFormOpen(true)
  }, [params])

  function openWith(idea: { title: string; area: NicheId }) {
    setTitle(idea.title)
    setArea(idea.area)
    setDays([])
    setFormTimes([])
    setGoalId(null)
    setFormError(null)
    setFormOpen(true)
  }

  function toggleFormDay(weekday: number) {
    setDays((prev) =>
      prev.includes(weekday) ? prev.filter((d) => d !== weekday) : [...prev, weekday].sort((a, b) => a - b),
    )
  }

  async function handleCreate() {
    const cleanTitle = title.trim()
    if (!cleanTitle) {
      setFormError('Escribe un nombre para el hábito.')
      return
    }
    setSaving(true)
    setFormError(null)
    try {
      const habit = await createHabit(userId, {
        title: cleanTitle,
        area,
        weekdays: days,
        goalId,
        times: cleanTimes(formTimes),
      })
      setHabits((prev) => [...(prev ?? []), habit])
      setTitle('')
      setArea('otra')
      setDays([])
      setFormTimes([])
      setGoalId(null)
      setFormOpen(false)
      toast(`Hábito creado: ${habit.title}`, 'success')
    } catch (err) {
      setFormError(friendlyError(err, 'No se pudo crear el hábito. Inténtalo de nuevo.'))
    } finally {
      setSaving(false)
    }
  }

  // --- Acciones sobre hábitos existentes ---
  const [menuId, setMenuId] = useState<string | null>(null)
  // Borrador de horas del hábito con el menú abierto: se muestra tal cual se
  // edita (sin reordenar los inputs bajo los dedos) y se persiste ordenado.
  const [menuTimes, setMenuTimes] = useState<string[]>([])

  function openMenu(habit: Habit) {
    if (menuId === habit.id) {
      setMenuId(null)
      return
    }
    setMenuId(habit.id)
    setMenuTimes(habit.times ?? [])
  }

  /** Suma o quita un check de un slot en el estado local (optimista/revert). */
  function patchChecks(habitId: string, check: HabitCheck, add: boolean) {
    setChecksByHabit((prev) => {
      const next = new Map(prev)
      const list = next.get(habitId) ?? []
      next.set(
        habitId,
        add
          ? [...list, check]
          : list.filter((c) => !(c.date === check.date && c.slot === check.slot)),
      )
      return next
    })
  }

  /**
   * Marca (o desmarca) el hábito para HOY, con la misma gramática de un toque
   * que en Hoy: marca la SIGUIENTE repetición pendiente y, si el día ya está
   * completo, desmarca la ÚLTIMA. Optimista; si el servidor falla, revierte.
   */
  async function toggleToday(habit: Habit) {
    const todayChecks = (checksByHabit.get(habit.id) ?? []).filter((c) => c.date === today)
    const slotToAdd = nextSlot(habit, todayChecks, today)
    const adding = slotToAdd !== null
    const slot = adding ? slotToAdd : Math.max(...todayChecks.map((c) => c.slot))
    const check: HabitCheck = { habitId: habit.id, date: today, slot }
    setActionError(null)
    patchChecks(habit.id, check, adding)
    try {
      await setHabitCheck(userId, habit.id, today, adding, slot)
    } catch (err) {
      patchChecks(habit.id, check, !adding)
      setActionError(friendlyError(err, 'No se pudo marcar el hábito.'))
    }
  }

  async function toggleHabitDay(habit: Habit, weekday: number) {
    const next = habit.weekdays.includes(weekday)
      ? habit.weekdays.filter((d) => d !== weekday)
      : [...habit.weekdays, weekday].sort((a, b) => a - b)
    // Optimista: el chip responde al toque; si el servidor falla, revertimos.
    setActionError(null)
    setHabits((prev) => prev?.map((h) => (h.id === habit.id ? { ...h, weekdays: next } : h)) ?? prev)
    try {
      const updated = await updateHabit(habit.id, { weekdays: next })
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? updated : h)) ?? prev)
    } catch (err) {
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? habit : h)) ?? prev)
      setActionError(friendlyError(err, 'No se pudieron guardar los días.'))
    }
  }

  /**
   * Cambia las horas del hábito desde el menú: el borrador se muestra tal cual
   * y se persiste limpio (sin vacías, ordenado). Optimista con revert.
   */
  async function changeHabitTimes(habit: Habit, next: string[]) {
    setMenuTimes(next)
    const nextTimes = cleanTimes(next)
    if ((habit.times ?? []).join(',') === (nextTimes ?? []).join(',')) return
    setActionError(null)
    setHabits((prev) => prev?.map((h) => (h.id === habit.id ? { ...h, times: nextTimes } : h)) ?? prev)
    try {
      const updated = await updateHabit(habit.id, { times: nextTimes })
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? updated : h)) ?? prev)
    } catch (err) {
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? habit : h)) ?? prev)
      setActionError(friendlyError(err, 'No se pudieron guardar las horas.'))
    }
  }

  /** Vincula (o desvincula) un hábito a una meta, con cambio optimista. */
  async function changeHabitGoal(habit: Habit, nextGoalId: string | null) {
    if (habit.goalId === nextGoalId) return
    setActionError(null)
    setHabits((prev) => prev?.map((h) => (h.id === habit.id ? { ...h, goalId: nextGoalId } : h)) ?? prev)
    try {
      const updated = await updateHabit(habit.id, { goalId: nextGoalId })
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? updated : h)) ?? prev)
    } catch (err) {
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? habit : h)) ?? prev)
      setActionError(friendlyError(err, 'No se pudo vincular la meta.'))
    }
  }

  async function setArchived(habit: Habit, archived: boolean) {
    setActionError(null)
    try {
      const updated = await setHabitArchived(habit.id, archived)
      setHabits((prev) => prev?.map((h) => (h.id === habit.id ? updated : h)) ?? prev)
      setMenuId(null)
    } catch (err) {
      setActionError(friendlyError(err, 'No se pudo actualizar el hábito.'))
    }
  }

  const active = habits?.filter((h) => h.archivedAt === null) ?? []
  const archived = habits?.filter((h) => h.archivedAt !== null) ?? []

  return (
    <div className="screen">
      <header className="row row--between screen__header" style={{ alignItems: 'flex-end' }}>
        <div>
          <span className="kicker">Rutinas de un toque</span>
          <h1 className="screen__title">Tus hábitos</h1>
        </div>
        <button
          className="btn btn--primary btn--sm"
          onClick={() => {
            setFormError(null)
            setFormOpen(true)
          }}
        >
          <IconPlus size={18} /> Nuevo
        </button>
      </header>

      {loadError && <div className="alert alert--warn">{loadError}</div>}
      {actionError && (
        <div className="alert alert--warn" role="status" aria-live="polite">
          {actionError}
        </div>
      )}

      {formOpen && (
        <section className="card stack" aria-label="Nuevo hábito">
          <input
            className="input"
            autoFocus
            placeholder="¿Qué quieres hacer cada día? Ej.: leer 10 minutos"
            maxLength={120}
            aria-label="Nombre del hábito"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void handleCreate()
            }}
          />

          <div className="stack stack--sm">
            <span className="kicker">Área</span>
            <div className="row wrap" role="group" aria-label="Área del hábito">
              {NICHES.map((niche) => (
                <button
                  key={niche.id}
                  type="button"
                  className={`chip${area === niche.id ? ' chip--selected' : ''}`}
                  aria-pressed={area === niche.id}
                  style={nicheAccent(niche.id)}
                  onClick={() => setArea(niche.id)}
                >
                  {niche.label}
                </button>
              ))}
            </div>
          </div>

          <div className="stack stack--sm">
            <span className="kicker">¿Qué días?</span>
            <div className="row wrap" role="group" aria-label="Días del hábito">
              {WEEKDAY_LABELS.map((label, weekday) => (
                <button
                  key={label}
                  type="button"
                  className={`chip${days.includes(weekday) ? ' chip--selected' : ''}`}
                  aria-pressed={days.includes(weekday)}
                  onClick={() => toggleFormDay(weekday)}
                >
                  {label}
                </button>
              ))}
            </div>
            {days.length === 0 && (
              <p className="faint tiny" style={{ margin: 0 }}>
                Sin días marcados, el hábito aplica todos los días.
              </p>
            )}
          </div>

          <TimesEditor times={formTimes} onChange={setFormTimes} />

          {activeGoals.length > 0 && (
            <div className="stack stack--sm">
              <span className="kicker">¿Suma a una meta? (opcional)</span>
              <div className="row wrap" role="group" aria-label="Meta vinculada">
                <button
                  type="button"
                  className={`chip${goalId === null ? ' chip--selected' : ''}`}
                  aria-pressed={goalId === null}
                  onClick={() => setGoalId(null)}
                >
                  Ninguna
                </button>
                {activeGoals.map((g) => (
                  <button
                    key={g.id}
                    type="button"
                    className={`chip${goalId === g.id ? ' chip--selected' : ''}`}
                    aria-pressed={goalId === g.id}
                    onClick={() => setGoalId(g.id)}
                  >
                    <NicheIcon area={g.area} size={14} /> {g.title}
                  </button>
                ))}
              </div>
              <p className="faint tiny" style={{ margin: 0 }}>
                El hábito aparece en el detalle de su meta y cuenta en la revisión semanal.
              </p>
            </div>
          )}

          {formError && <div className="alert alert--warn" role="alert">{formError}</div>}

          <div className="row">
            <button className="btn btn--primary" disabled={saving} onClick={() => void handleCreate()}>
              {saving ? 'Creando…' : 'Crear hábito'}
            </button>
            <button className="btn btn--ghost" disabled={saving} onClick={() => setFormOpen(false)}>
              Cancelar
            </button>
          </div>
        </section>
      )}

      {habits === null && !loadError ? (
        <SkeletonList rows={4} />
      ) : (
        <>
          {active.length === 0 && !loadError ? (
            <div className="empty">
              <span className="empty__icon">
                <IconFlame size={34} />
              </span>
              <p className="empty__title">Todavía no tienes hábitos</p>
              <p className="muted">Crea el primero o toca una idea popular para empezar.</p>
            </div>
          ) : (
            <ul className="stack stack--sm" style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {active.map((habit) => {
                const checks = checksByHabit.get(habit.id) ?? EMPTY_CHECKS
                // Racha y semana cuentan solo los días con el hábito COMPLETO
                // (todas sus repeticiones, si tiene horas).
                const completeDates = habitCompleteDates(habit, checks)
                const streak = habitStreak(completeDates, habit.weekdays, today)
                const week = habitWeek(completeDates, habit, weekStart)
                const dueToday = habitAppliesOn(habit, today)
                const target = habitTarget(habit)
                const doneCount = habitDoneCount(checks, habit.id, today)
                const doneToday = doneCount >= target
                return (
                  <li key={habit.id} className="card card--tight stack stack--sm" style={nicheAccent(habit.area)}>
                    <div className="row" style={{ alignItems: 'center' }}>
                      {dueToday && (
                        <button
                          type="button"
                          className={`check${doneToday ? ' check--done' : ''}`}
                          style={{ flex: 'none' }}
                          aria-pressed={doneToday}
                          aria-label={`${doneToday ? 'Desmarcar' : 'Marcar'} hoy el hábito: ${habit.title}`}
                          onClick={() => void toggleToday(habit)}
                        />
                      )}
                      <NicheGlyph area={habit.area} size="sm" />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ margin: 0, fontWeight: 600, wordBreak: 'break-word' }}>{habit.title}</p>
                        <span className="row row--sm wrap" style={{ alignItems: 'center', rowGap: 2 }}>
                          <span className="faint tiny">{pautaLabel(habit)}</span>
                          {target > 1 && dueToday && (
                            <span className="tag">{doneCount} de {target} hoy</span>
                          )}
                          {habit.goalId && goalById.get(habit.goalId) && (
                            <span className="tag">
                              <IconArrowReturn size={11} /> {goalById.get(habit.goalId)!.title}
                            </span>
                          )}
                        </span>
                      </div>
                      {streak >= 2 && (
                        <span className="streak-chip" title={`Racha de ${streak} días`}>
                          <IconFlame size={13} /> {streak}
                        </span>
                      )}
                      <button
                        type="button"
                        className="iconbtn iconbtn--sm"
                        aria-expanded={menuId === habit.id}
                        aria-label={`Opciones del hábito: ${habit.title}`}
                        onClick={() => openMenu(habit)}
                      >
                        <IconDots size={17} />
                      </button>
                    </div>

                    {/* Mini-cadena de la semana: lunes primero; "due" se pinta como futuro. */}
                    <div className="row" style={{ gap: 4 }} aria-label="Tu semana">
                      {week.map((state, i) => (
                        <span
                          key={i}
                          className={`weekstrip__dot weekstrip__dot--${DOT_CLASS[state]}`}
                          title={WEEKDAY_LABELS[i]}
                        />
                      ))}
                    </div>

                    {menuId === habit.id && (
                      <div className="stack stack--sm">
                        <span className="kicker">Días del hábito</span>
                        <div className="row wrap" role="group" aria-label={`Días de: ${habit.title}`}>
                          {WEEKDAY_LABELS.map((label, weekday) => (
                            <button
                              key={label}
                              type="button"
                              className={`chip${habit.weekdays.includes(weekday) ? ' chip--selected' : ''}`}
                              aria-pressed={habit.weekdays.includes(weekday)}
                              onClick={() => void toggleHabitDay(habit, weekday)}
                            >
                              {label}
                            </button>
                          ))}
                        </div>
                        {habit.weekdays.length === 0 && (
                          <p className="faint tiny" style={{ margin: 0 }}>
                            Sin días marcados, aplica todos los días.
                          </p>
                        )}
                        <TimesEditor
                          times={menuTimes}
                          onChange={(next) => void changeHabitTimes(habit, next)}
                        />
                        {activeGoals.length > 0 && (
                          <>
                            <span className="kicker">¿Suma a una meta?</span>
                            <div className="row wrap" role="group" aria-label={`Meta de: ${habit.title}`}>
                              <button
                                type="button"
                                className={`chip${habit.goalId === null ? ' chip--selected' : ''}`}
                                aria-pressed={habit.goalId === null}
                                onClick={() => void changeHabitGoal(habit, null)}
                              >
                                Ninguna
                              </button>
                              {activeGoals.map((g) => (
                                <button
                                  key={g.id}
                                  type="button"
                                  className={`chip${habit.goalId === g.id ? ' chip--selected' : ''}`}
                                  aria-pressed={habit.goalId === g.id}
                                  onClick={() => void changeHabitGoal(habit, g.id)}
                                >
                                  <NicheIcon area={g.area} size={14} /> {g.title}
                                </button>
                              ))}
                            </div>
                          </>
                        )}
                        <button
                          className="btn btn--subtle btn--sm"
                          style={{ alignSelf: 'flex-start' }}
                          onClick={() => void setArchived(habit, true)}
                        >
                          Archivar
                        </button>
                      </div>
                    )}
                  </li>
                )
              })}
            </ul>
          )}

          {/* Ideas populares: un toque precarga el formulario; nada se crea sin confirmar. */}
          <section className="stack stack--sm" style={{ marginTop: 'var(--s5)' }}>
            <div className="section-head">
              <span className="kicker row row--sm" style={{ alignItems: 'center' }}>
                <IconLightbulb size={14} /> Ideas populares
              </span>
            </div>
            <div className="row wrap">
              {HABIT_IDEAS.map((idea) => (
                <button
                  key={idea.title}
                  type="button"
                  className="chip"
                  style={nicheAccent(idea.area)}
                  onClick={() => openWith(idea)}
                >
                  {idea.title}
                </button>
              ))}
            </div>
          </section>

          {archived.length > 0 && (
            <details className="goals-finished">
              <summary className="goals-finished__summary">
                {archived.length === 1 ? '1 hábito archivado' : `${archived.length} hábitos archivados`}
              </summary>
              <ul className="stack stack--sm" style={{ listStyle: 'none', padding: 0, margin: 'var(--s3) 0 0' }}>
                {archived.map((habit) => (
                  <li
                    key={habit.id}
                    className="card card--tight row row--between"
                    style={{ alignItems: 'center', ...nicheAccent(habit.area) }}
                  >
                    <div className="row row--sm" style={{ alignItems: 'center', minWidth: 0 }}>
                      <NicheGlyph area={habit.area} size="sm" />
                      <span className="muted" style={{ wordBreak: 'break-word' }}>
                        {habit.title}
                      </span>
                    </div>
                    <button className="btn btn--subtle btn--sm" onClick={() => void setArchived(habit, false)}>
                      Reactivar
                    </button>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </div>
  )
}
