import { useEffect, useRef, useState } from 'react'
import type { Goal, Habit } from '@/lib/types'
import type { HabitDraft } from '@/screens/habits/habitDraft'
import { Sheet } from '@/components/Sheet'
import { createHabit, updateHabit } from '@/services/habits'
import { friendlyError } from '@/lib/errors'
import { useToast } from '@/app/toast'
import { SheetStepIdentity } from '@/screens/habits/SheetStepIdentity'
import { SheetStepFrequency } from '@/screens/habits/SheetStepFrequency'
import { SheetStepConfirm } from '@/screens/habits/SheetStepConfirm'
import '@/styles/habits.css'
import '@/styles/habit-sheet.css'

export interface HabitSheetProps {
  mode: 'create' | 'edit'
  /** Id del hábito que se edita (solo en modo edit). */
  habitId?: string
  initial: HabitDraft
  initialStep?: 1 | 2 | 3
  /** Metas activas del usuario, para "Meta vinculada". */
  goals: Goal[]
  userId: string
  /** Recibe el hábito ya guardado (creado o actualizado). */
  onSaved: (habit: Habit) => void
  onClose: () => void
}

type Step = 1 | 2 | 3

/**
 * Hoja "Nuevo hábito" en tres pasos: nombre e identidad, frecuencia y
 * confirmación. La misma hoja edita un hábito existente (`mode: 'edit'`), que
 * es la razón por la que el paso 3 remata con "Guardar" en vez de "Crear".
 *
 * Nada se guarda hasta el CTA del último paso: "Cancelar" cierra sin tocar
 * nada y "Atrás" solo retrocede. El borrador vive aquí, así el ir y venir
 * entre pasos no pierde lo escrito.
 */
export function HabitSheet({
  mode,
  habitId,
  initial,
  initialStep = 1,
  goals,
  userId,
  onSaved,
  onClose,
}: HabitSheetProps) {
  const { toast } = useToast()
  const [step, setStep] = useState<Step>(initialStep)
  const [draft, setDraft] = useState<HabitDraft>(initial)
  // El interruptor es estado de la hoja, no del hábito: apagarlo guarda sin
  // horas pero conserva las escritas por si el usuario lo vuelve a encender.
  const [reminders, setReminders] = useState(initial.times.length > 0)
  const [invalidName, setInvalidName] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const nameRef = useRef<HTMLInputElement | null>(null)

  // El foco arranca en el nombre (no con autoFocus: la trampa de foco de Sheet
  // ya enfocó el primer botón y este efecto corre después).
  useEffect(() => {
    if (initialStep === 1) nameRef.current?.focus()
  }, [initialStep])

  function patch(over: Partial<HabitDraft>) {
    setDraft((prev) => ({ ...prev, ...over }))
    if (over.title !== undefined && over.title.trim().length > 0) setInvalidName(false)
  }

  const editing = mode === 'edit'
  const title = editing ? 'Editar hábito' : 'Nuevo hábito'
  const cta = step < 3 ? 'Continuar' : editing ? 'Guardar' : 'Crear hábito'

  function goNext() {
    if (step === 1 && draft.title.trim().length === 0) {
      setInvalidName(true)
      nameRef.current?.focus()
      return
    }
    setStep((s) => (s === 1 ? 2 : 3))
  }

  async function save(close: () => void) {
    const clean = draft.title.trim()
    if (clean.length === 0) {
      setStep(1)
      setInvalidName(true)
      return
    }
    if (editing && !habitId) {
      // Nunca debería pasar; si pasara, crear un duplicado sería peor.
      setError('No se pudo guardar el hábito.')
      return
    }
    setSaving(true)
    setError(null)
    const times = reminders ? [...draft.times].sort() : []
    const unit = draft.unit && draft.unit.trim().length > 0 ? draft.unit.trim() : null
    const payload = {
      title: clean,
      area: draft.area,
      weekdays: draft.weekdays,
      goalId: draft.goalId,
      times: times.length > 0 ? times : null,
      icon: draft.icon,
      color: draft.color,
      unit,
      timesPerDay: Math.max(1, Math.floor(draft.timesPerDay)),
    }
    try {
      const habit =
        editing && habitId
          ? await updateHabit(habitId, payload)
          : await createHabit(userId, payload)
      toast(`${editing ? 'Hábito actualizado' : 'Hábito creado'}: ${clean}`, 'success')
      onSaved(habit)
      close()
    } catch (err) {
      // Sin la migración 0016 el mensaje ya viene listo para el usuario.
      const code = err instanceof Error ? (err as Error & { code?: string }).code : undefined
      setError(
        code === 'missing-column' && err instanceof Error
          ? err.message
          : friendlyError(err, 'No se pudo guardar el hábito.'),
      )
      setSaving(false)
    }
  }

  return (
    <Sheet onClose={onClose} label={title} panelClassName="hsheet-panel">
      {(close) => (
        <>
          <div className="hsheet-head">
            <button
              type="button"
              className="hsheet-lead"
              onClick={() => (step === 1 ? close() : setStep(step === 3 ? 2 : 1))}
            >
              {step === 1 ? 'Cancelar' : 'Atrás'}
            </button>
            <h2 className="hsheet-title">{title}</h2>
            <span className="hsheet-count">{step} de 3</span>
          </div>

          <div className="hsheet-bars" aria-hidden="true">
            <span className="hsheet-bar" data-on={step >= 1} />
            <span className="hsheet-bar" data-on={step >= 2} />
            <span className="hsheet-bar" data-on={step >= 3} />
          </div>

          <div className="hsheet-body">
            {step === 1 && (
              <SheetStepIdentity
                draft={draft}
                patch={patch}
                nameRef={nameRef}
                invalid={invalidName}
                onEnter={goNext}
              />
            )}
            {step === 2 && (
              <SheetStepFrequency
                draft={draft}
                patch={patch}
                reminders={reminders}
                onReminders={setReminders}
              />
            )}
            {step === 3 && (
              <SheetStepConfirm draft={draft} patch={patch} goals={goals} userId={userId} />
            )}
          </div>

          <div className="hsheet-foot">
            {error && (
              <p className="hsheet-error" role="alert">
                {error}
              </p>
            )}
            <button
              type="button"
              className="hsheet-cta"
              disabled={saving}
              onClick={() => (step < 3 ? goNext() : void save(close))}
            >
              {saving ? 'Guardando…' : cta}
            </button>
          </div>
        </>
      )}
    </Sheet>
  )
}
