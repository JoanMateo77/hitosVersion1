import type { ReactNode, RefObject, SubmitEvent } from 'react'
import type { Goal, Habit, Session, Task } from '@/lib/types'
import type { LaterItem } from '@/domain/today'
import { goalAccent } from '@/lib/goalAccent'
import { Disclosure } from '@/components/Disclosure'
import { Hint } from '@/components/Hint'
import { HabitIcon } from '@/components/HabitIcon'
import { NicheIcon } from '@/components/NicheGlyph'
import { IconBriefcase, IconCalendar, IconCheck, IconChevronRight, IconClock, IconFlame, IconPlus } from '@/components/icons'

function laterGlyph(kind: LaterItem['kind']) {
  if (kind === 'session') return <IconBriefcase size={15} />
  if (kind === 'habit') return <IconFlame size={16} />
  if (kind === 'task') return <IconCheck size={16} />
  return <IconCalendar size={16} />
}

/**
 * El hábito muestra su propio azulejo de identidad (icono + color); la sesión,
 * el color del área de su meta; el resto, el glifo genérico gris de la fila.
 */
function ItemGlyph({ item, habit, goal }: Readonly<{ item: LaterItem; habit?: Habit; goal?: Goal }>) {
  if (habit) return <HabitIcon habit={habit} size="sm" />
  if (goal) {
    return (
      <span className="today-item__glyph today-item__glyph--goal" style={goalAccent(goal)} aria-hidden="true">
        <NicheIcon area={goal.area} size={16} />
      </span>
    )
  }
  return (
    <span className="today-item__glyph" aria-hidden="true">
      {laterGlyph(item.kind)}
    </span>
  )
}

interface SessionActionsProps {
  item: LaterItem
  session: Session
  onResume: (session: Session) => void
  onReopen: (session: Session) => void
  onOpen: (session: Session) => void
}

/**
 * Una sesión (25 min, 1 h…) no se cierra con un toque: se abre y se cumple con
 * el cronómetro. Hecha: check fijo y "Deshacer"; parcial: "Retomar".
 */
function SessionActions({ item, session, onResume, onReopen, onOpen }: Readonly<SessionActionsProps>) {
  return (
    <>
      {session.status === 'partial' && (
        <button type="button" className="btn--link today-item__link" onClick={() => onResume(session)}>
          Retomar
        </button>
      )}
      {session.status === 'done' && (
        <button type="button" className="btn--link today-item__link" onClick={() => onReopen(session)}>
          Deshacer
        </button>
      )}
      {item.done ? (
        <span className="today-item__check today-item__check--done today-item__check--static" aria-hidden="true">
          <IconCheck size={14} />
        </span>
      ) : (
        <button
          type="button"
          className="today-item__open"
          aria-label={`Abrir la sesión "${item.title}"`}
          onClick={() => onOpen(session)}
        >
          <IconChevronRight size={16} />
        </button>
      )}
    </>
  )
}

/** Lo que hace falta para pintar y operar una fila de "Más tarde hoy". */
export interface LaterLookup {
  sessionOf: (id: string) => Session | undefined
  habitOf: (id: string) => Habit | undefined
  goalOf: (id: string) => Goal | undefined
  /** Marca o desmarca un hábito, una tarea o un evento. */
  onToggle: (item: LaterItem) => void
  onResume: (session: Session) => void
  onReopen: (session: Session) => void
  onOpen: (session: Session) => void
}

function LaterRow({ item, lookup }: Readonly<{ item: LaterItem; lookup: LaterLookup }>) {
  const session = item.kind === 'session' ? lookup.sessionOf(item.id) : undefined
  const habit = item.kind === 'habit' ? lookup.habitOf(item.id) : undefined
  const goal = session ? lookup.goalOf(session.goalId) : undefined
  return (
    <li className={`today-item${item.done ? ' today-item--done' : ''}`}>
      <ItemGlyph item={item} habit={habit} goal={goal} />
      <span className="today-item__text">
        <span className="today-item__title">{item.title}</span>
        <span className="today-item__sub">{item.subtitle}</span>
      </span>
      {session ? (
        <SessionActions
          item={item}
          session={session}
          onResume={lookup.onResume}
          onReopen={lookup.onReopen}
          onOpen={lookup.onOpen}
        />
      ) : (
        <button
          type="button"
          className={`today-item__check${item.done ? ' today-item__check--done' : ''}`}
          aria-pressed={item.done}
          aria-label={item.done ? `Desmarcar "${item.title}"` : `Marcar "${item.title}" como hecho`}
          onClick={() => lookup.onToggle(item)}
        >
          {item.done && <IconCheck size={14} />}
        </button>
      )}
    </li>
  )
}

function laterRows(items: LaterItem[], lookup: LaterLookup): ReactNode {
  return items.map((item) => <LaterRow key={`${item.kind}:${item.id}`} item={item} lookup={lookup} />)
}

/** Tareas propias de ayer que quedaron pendientes: traerlas o descartarlas. */
function YesterdayRow({ tasks, onBring, onDismiss }: Readonly<{ tasks: Task[]; onBring: () => void; onDismiss: () => void }>) {
  return (
    <li className="today-item">
      <span className="today-item__glyph" aria-hidden="true">
        <IconClock size={16} />
      </span>
      <span className="today-item__text">
        <span className="today-item__title">
          {tasks.length === 1 ? '1 tarea de ayer' : `${tasks.length} tareas de ayer`}
        </span>
        <span className="today-item__sub">{tasks.map((t) => t.title).join(' · ')}</span>
      </span>
      <span className="today-item__links">
        <button className="btn--link today-item__link" onClick={onBring}>
          Traer
        </button>
        <button className="btn--link today-item__link" onClick={onDismiss}>
          Descartar
        </button>
      </span>
    </li>
  )
}

interface AddTaskProps {
  open: boolean
  title: string
  inputRef: RefObject<HTMLInputElement | null>
  onToggle: () => void
  onTitle: (title: string) => void
  onSubmit: (e: SubmitEvent<HTMLFormElement>) => void
}

interface LaterSectionProps {
  pending: LaterItem[]
  done: LaterItem[]
  lookup: LaterLookup
  hasPartialSession: boolean
  yesterday: Task[]
  onBringYesterday: () => void
  onDismissYesterday: () => void
  addTask: AddTaskProps
}

/** "Más tarde hoy": lo pendiente del día, lo hecho plegado y la entrada para sumar algo. */
export function LaterSection({
  pending,
  done,
  lookup,
  hasPartialSession,
  yesterday,
  onBringYesterday,
  onDismissYesterday,
  addTask,
}: Readonly<LaterSectionProps>) {
  return (
    <section className="today-section" aria-label="Más tarde hoy">
      <div className="today-later__head">
        <span className="section-title">Más tarde hoy</span>
        <button
          type="button"
          className="today-later__add"
          aria-label="Agregar algo para hoy"
          aria-expanded={addTask.open}
          onClick={addTask.onToggle}
        >
          <IconPlus size={16} />
        </button>
      </div>

      {addTask.open && (
        <form className="row" onSubmit={addTask.onSubmit}>
          <input
            ref={addTask.inputRef}
            className="input"
            placeholder="Agrega algo para hoy…"
            value={addTask.title}
            onChange={(e) => addTask.onTitle(e.target.value)}
            maxLength={300}
            autoCapitalize="sentences"
            autoCorrect="on"
            enterKeyHint="send"
            inputMode="text"
          />
          <button className="iconbtn" type="submit" aria-label="Agregar tarea" disabled={!addTask.title.trim()}>
            <IconPlus size={18} />
          </button>
        </form>
      )}

      <ul className="today-list">
        {yesterday.length > 0 && (
          <YesterdayRow tasks={yesterday} onBring={onBringYesterday} onDismiss={onDismissYesterday} />
        )}
        {laterRows(pending, lookup)}
        {pending.length === 0 && yesterday.length === 0 && (
          <li className="today-item today-item--empty">
            <span className="today-item__sub">Nada más por hoy</span>
          </li>
        )}
      </ul>

      {done.length > 0 && (
        <Disclosure summary={`Hecho hoy · ${done.length}`}>
          <ul className="today-list">{laterRows(done, lookup)}</ul>
          {hasPartialSession && (
            <Hint id="session-partial-2026-06">
              Una sesión <strong>parcial</strong> cuenta lo que hiciste y no rompe tu racha. Puedes retomarla para
              completarla.
            </Hint>
          )}
        </Disclosure>
      )}
    </section>
  )
}
