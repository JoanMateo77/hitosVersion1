import { useState, type RefObject } from 'react'
import { HABIT_COLORS, HABIT_ICONS, HABIT_SUGGESTIONS } from '@/domain/habits'
import { HabitIcon } from '@/components/HabitIcon'
import type { HabitDraft } from '@/screens/habits/habitDraft'

/** Los 7 emojis que se ven sin desplegar el catálogo (el 8º hueco es "···"). */
const QUICK_ICONS = HABIT_ICONS.slice(0, 7)

/** Chips del paso 1: las 5 sugerencias que siguen a "Beber agua". */
const CHIP_SUGGESTIONS = HABIT_SUGGESTIONS.slice(1, 6)

/**
 * Paso 1 de la hoja: cómo se llama el hábito y cómo se reconoce (emoji y
 * color). El azulejo grande va arriba para que cada toque en la parrilla se
 * vea al instante en el mismo lugar donde vivirá el hábito.
 */
export function SheetStepIdentity({
  draft,
  patch,
  nameRef,
  invalid,
  onEnter,
}: {
  draft: HabitDraft
  patch: (over: Partial<HabitDraft>) => void
  nameRef: RefObject<HTMLInputElement | null>
  /** El nombre quedó vacío al intentar continuar. */
  invalid: boolean
  onEnter: () => void
}) {
  const [showAll, setShowAll] = useState(false)

  // El icono elegido siempre está a la vista: si no es de los 7 rápidos,
  // encabeza la fila y desplaza al último.
  const quick = QUICK_ICONS.includes(draft.icon)
    ? QUICK_ICONS
    : [draft.icon, ...QUICK_ICONS.slice(0, 6)]
  const rest = HABIT_ICONS.filter((icon) => !quick.includes(icon))

  return (
    <>
      <div className="hsheet-identity">
        <HabitIcon icon={draft.icon} color={draft.color} size="xl" />
        <input
          ref={nameRef}
          id="hsheet-name"
          className="hsheet-name"
          type="text"
          value={draft.title}
          maxLength={120}
          placeholder="Nombre del hábito"
          aria-label="Nombre del hábito"
          aria-invalid={invalid}
          aria-describedby={invalid ? 'hsheet-name-error' : undefined}
          onChange={(e) => patch({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key !== 'Enter') return
            e.preventDefault()
            onEnter()
          }}
        />
        {invalid && (
          <p className="hsheet-error" id="hsheet-name-error" role="alert">
            Escribe un nombre para el hábito.
          </p>
        )}
      </div>

      <section className="hsheet-group">
        <span className="hab-kicker">Icono</span>
        <div className="hsheet-grid">
          {quick.map((icon) => (
            <button
              key={icon}
              type="button"
              className="hsheet-tile"
              aria-label={`Icono ${icon}`}
              aria-pressed={draft.icon === icon}
              onClick={() => patch({ icon })}
            >
              {icon}
            </button>
          ))}
          <button
            type="button"
            className="hsheet-tile hsheet-tile--more"
            aria-label="Ver todos los iconos"
            aria-expanded={showAll}
            onClick={() => setShowAll((v) => !v)}
          >
            ···
          </button>
        </div>
        {showAll && (
          <div className="hsheet-grid">
            {rest.map((icon) => (
              <button
                key={icon}
                type="button"
                className="hsheet-tile"
                aria-label={`Icono ${icon}`}
                aria-pressed={draft.icon === icon}
                onClick={() => patch({ icon })}
              >
                {icon}
              </button>
            ))}
          </div>
        )}

        <span className="hab-kicker hsheet-kicker--gap">Color</span>
        <div className="hsheet-grid">
          {HABIT_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className="hsheet-dot"
              data-color={color}
              aria-label={`Color ${color}`}
              aria-pressed={draft.color === color}
              onClick={() => patch({ color })}
            />
          ))}
        </div>
      </section>

      <section className="hsheet-group">
        <span className="hab-kicker">Sugerencias</span>
        <div className="hsheet-chips">
          {CHIP_SUGGESTIONS.map((s) => (
            <button
              key={s.title}
              type="button"
              className="hsheet-chip"
              onClick={() =>
                // Solo la identidad y el ritmo: una meta ya vinculada o las
                // horas que el usuario haya puesto no se pierden.
                patch({
                  title: s.title,
                  icon: s.icon,
                  color: s.color,
                  area: s.area,
                  timesPerDay: s.timesPerDay,
                  unit: s.unit,
                  weekdays: s.weekdays,
                })
              }
            >
              <span aria-hidden="true">{s.icon}</span> {s.title}
            </button>
          ))}
        </div>
      </section>
    </>
  )
}
