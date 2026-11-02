import { useEffect, useRef, useState, type KeyboardEvent } from 'react'
import type { ChatContext, CriterionOption } from '@/domain/coachChat'
import { requestCriteria } from '@/services/goalPlan'
import { CoachComposer } from '@/components/coach/CoachChatView'

const SHORTCUTS = ['Más medible', 'Que vea avance pronto', 'Que dependa solo de mí']

/**
 * "¿Cómo sabrás que lo lograste?": la IA propone tres formas y la persona
 * decide. Ninguna queda elegida en silencio, todo es editable y, si ninguna
 * convence, se le piden otras con un atajo o con sus palabras.
 */
export function CriteriaSuggest({
  context,
  value,
  onChange,
  options,
  onOptions,
}: Readonly<{
  context: () => ChatContext
  value: string
  onChange: (value: string) => void
  /** Viven en el padre para no volver a pedirlas al ir y volver de paso. */
  options: CriterionOption[] | null
  onOptions: (options: CriterionOption[]) => void
}>) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const asked = useRef(false)

  async function ask(hint = '') {
    setLoading(true)
    setError(null)
    try {
      onOptions(await requestCriteria(context(), hint))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'No pudimos traer propuestas ahora.')
    } finally {
      setLoading(false)
    }
  }

  // Las primeras propuestas llegan solas al entrar al paso.
  useEffect(() => {
    if (asked.current || options) return
    asked.current = true
    void ask()
    // Solo al montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const selected = (o: CriterionOption) => value.trim().replace(/\.$/, '') === o.text.trim().replace(/\.$/, '')
  // Un solo punto de tabulación en el grupo: la elegida o, si no hay, la primera.
  const checkedIndex = options?.findIndex(selected) ?? -1
  const tabIndexOf = (i: number) => (i === Math.max(checkedIndex, 0) ? 0 : -1)

  // Flechas: mueven el foco y eligen (patrón radiogroup), dando la vuelta.
  function onRadioKey(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowDown: 1, ArrowRight: 1, ArrowUp: -1, ArrowLeft: -1 }[e.key]
    if (!delta || !options || options.length === 0) return
    const radios = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')]
    const i = radios.indexOf(e.target as HTMLButtonElement)
    if (i < 0) return
    e.preventDefault()
    const next = (i + delta + radios.length) % radios.length
    radios[next].focus()
    onChange(options[next].text)
  }

  return (
    <div className="stack stack--sm criteria">
      <span className="section-title">¿Cómo sabrás que lo lograste?</span>
      {loading ? (
        <div className="stack stack--sm" aria-hidden="true">
          {[0, 1, 2].map((i) => (
            <div key={i} className="criteria-skel">
              <span className="skel" style={{ width: '80%' }} />
              <span className="skel" style={{ width: '45%', height: 10 }} />
            </div>
          ))}
        </div>
      ) : (
        options &&
        options.length > 0 && (
          // tabIndex -1: enfocable por script sin sumar una parada de Tab (el foco
          // con Tab va al radio elegido y las flechas lo mueven).
          <div
            className="stack stack--sm"
            role="radiogroup"
            aria-label="Propuestas del coach"
            tabIndex={-1}
            onKeyDown={onRadioKey}
          >
            {options.map((o, i) => (
              <button
                key={o.text}
                type="button"
                role="radio"
                aria-checked={selected(o)}
                tabIndex={tabIndexOf(i)}
                className="criteria-opt coach-rise"
                style={{ animationDelay: `${i * 70}ms` }}
                onClick={() => onChange(o.text)}
              >
                <span className="criteria-opt__radio" aria-hidden="true" />
                <span className="stack" style={{ gap: 2 }}>
                  <b>{o.text}</b>
                  <span className="tiny muted">{o.why}</span>
                </span>
              </button>
            ))}
          </div>
        )
      )}
      {error && <p className="tiny faint">{error}</p>}

      <div className="criteria-ask stack stack--sm">
        <span className="small">¿Ninguna te convence? Pídele otras</span>
        <div className="row wrap" style={{ gap: 'var(--s2)' }}>
          {SHORTCUTS.map((s) => (
            <button key={s} type="button" className="chip" disabled={loading} onClick={() => void ask(s)}>
              {s}
            </button>
          ))}
        </div>
        <CoachComposer
          onSend={(t) => void ask(t)}
          disabled={loading}
          placeholder="Ej.: algo sobre no endeudarme"
        />
      </div>

      <label className="tiny faint" htmlFor="criteria-input">
        Tu criterio (puedes editarlo o escribir el tuyo)
      </label>
      <input
        id="criteria-input"
        className="input"
        placeholder="Lo sabré cuando…"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        maxLength={200}
        autoCapitalize="sentences"
        autoCorrect="on"
        enterKeyHint="done"
        inputMode="text"
      />
    </div>
  )
}
