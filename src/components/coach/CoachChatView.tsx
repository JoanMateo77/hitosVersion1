import { useEffect, useRef, useState, type ReactNode } from 'react'
import type { StageChange, StoredProposal } from '@/domain/coachChat'
import type { CoachChat } from '@/hooks/useCoachChat'
import { IconArrowUp, IconSparkle } from '@/components/icons'

/** Avatar del coach: el mismo círculo en todas partes; respira mientras piensa. */
export function CoachOrb({ thinking = false, size = 36 }: Readonly<{ thinking?: boolean; size?: number }>) {
  return (
    <span className={`coach-orb${thinking ? ' coach-orb--thinking' : ''}`} style={{ width: size, height: size }} aria-hidden="true">
      <IconSparkle size={Math.round(size * 0.5)} />
    </span>
  )
}

/** Caja de texto siempre visible: la vía más fácil de explicarse con sus palabras. */
export function CoachComposer({
  onSend,
  disabled = false,
  placeholder = 'Cuéntale con tus palabras…',
  autoFocus = false,
  multiline = false,
  maxLength = 600,
  label = 'Escríbele al coach',
  prefill = null,
}: Readonly<{
  onSend: (text: string) => void
  /** Solo deshabilita el botón: el campo sigue usable mientras la IA responde. */
  disabled?: boolean
  placeholder?: string
  autoFocus?: boolean
  /** Textarea de 3 líneas: Enter envía y Shift+Enter hace salto de línea. */
  multiline?: boolean
  maxLength?: number
  label?: string
  /** Texto que se pone en el cuadro (un objeto nuevo cada vez: tocar el mismo ejemplo dos veces también lo pone). */
  prefill?: { text: string } | null
}>) {
  const [text, setText] = useState('')
  // Foco por ref y no con el atributo autoFocus (accesibilidad, regla de Sonar).
  const inputRef = useRef<HTMLInputElement & HTMLTextAreaElement>(null)
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  useEffect(() => {
    if (!prefill) return
    setText(prefill.text.slice(0, maxLength))
    inputRef.current?.focus()
  }, [prefill, maxLength])
  const submit = () => {
    if (!text.trim() || disabled) return
    onSend(text)
    setText('')
  }
  const common = {
    'aria-label': label,
    placeholder,
    value: text,
    maxLength,
    ref: inputRef,
    enterKeyHint: 'send' as const,
    autoCapitalize: 'sentences',
  }
  return (
    <form
      className={`coach-composer${multiline ? ' coach-composer--multiline' : ''}`}
      onSubmit={(e) => {
        e.preventDefault()
        submit()
      }}
    >
      {multiline ? (
        <textarea
          {...common}
          rows={3}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault()
              submit()
            }
          }}
        />
      ) : (
        <input {...common} onChange={(e) => setText(e.target.value)} />
      )}
      <button type="submit" aria-label="Enviar" disabled={disabled || !text.trim()}>
        <IconArrowUp size={16} />
      </button>
    </form>
  )
}

function describe(c: StageChange): ReactNode {
  if (c.kind === 'add') return <>Agregar <b>“{c.title}”</b></>
  if (c.kind === 'remove') return <>Quitar <b>“{c.title}”</b></>
  return <>Cambiar <b>“{c.title}”</b> por <b>“{c.newTitle}”</b></>
}

/** Propuesta del coach: cambios a las etapas o un avance a registrar. Nada se guarda sin el sí. */
function ProposalCard({
  proposal,
  onApply,
  onDismiss,
}: Readonly<{ proposal: StoredProposal; onApply: () => void; onDismiss: () => void }>) {
  const isProgress = proposal.kind === 'progress'
  const applied = proposal.status === 'applied'
  const doneLabel = isProgress ? 'Avance registrado' : 'Aplicado'
  const applyLabel = isProgress ? 'Registrar avance' : 'Aplicar'
  return (
    <div className={`coach-proposal${applied ? ' coach-proposal--applied' : ''}`}>
      {proposal.kind === 'progress' ? (
        <>
          <span className="small">Registrar como avance de hoy:</span>
          {/* La nota viene de la IA: siempre como texto, nunca HTML. */}
          <blockquote className="small coach-proposal__note">“{proposal.note}”</blockquote>
        </>
      ) : (
        <>
          <span className="small">{proposal.summary}</span>
          {proposal.path ? (
            <ol className="coach-proposal__list" aria-label="Camino propuesto">
              {proposal.path.map((title) => (
                <li key={title} className="small">
                  <b>{title}</b>
                </li>
              ))}
            </ol>
          ) : (
            <ul className="coach-proposal__list">
              {proposal.changes.map((c) => (
                <li key={`${c.kind}-${c.title}`} className="small">
                  {describe(c)}
                </li>
              ))}
            </ul>
          )}
        </>
      )}
      {applied ? (
        <span className="tiny coach-proposal__done">{doneLabel}</span>
      ) : (
        <div className="coach-proposal__actions">
          <button type="button" className="btn btn--secondary btn--sm" onClick={onDismiss}>
            Ahora no
          </button>
          <button type="button" className="btn btn--primary btn--sm" onClick={onApply}>
            {applyLabel}
          </button>
        </div>
      )}
    </div>
  )
}

/** Hilo de la conversación con las propuestas aplicables. */
export function CoachThread({ chat, empty }: Readonly<{ chat: CoachChat; empty?: ReactNode }>) {
  const end = useRef<HTMLDivElement | null>(null)
  useEffect(() => {
    end.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
  }, [chat.messages.length, chat.pending])

  if (chat.messages.length === 0 && !chat.pending) return empty ? <div className="coach-thread">{empty}</div> : null
  return (
    <div className="coach-thread" aria-live="polite">
      {chat.messages.map((m) => (
        <div key={m.id} className="coach-thread__group">
          <p className={`coach-msg coach-msg--${m.role}`}>{m.text}</p>
          {m.proposal && m.proposal.status !== 'dismissed' && (
            <ProposalCard
              proposal={m.proposal}
              onApply={() => void chat.apply(m.id)}
              onDismiss={() => chat.dismiss(m.id)}
            />
          )}
        </div>
      ))}
      {chat.pending && (
        <p className="coach-msg coach-msg--coach coach-typing" aria-label="El coach está escribiendo">
          <i />
          <i />
          <i />
        </p>
      )}
      {chat.error && (
        <output className="tiny faint" style={{ display: 'block' }}>
          {chat.error}
        </output>
      )}
      <div ref={end} />
    </div>
  )
}

/** Botón ✦: abre el chat. `dot` avisa que el coach tiene algo que decir. */
export function CoachButton({
  onClick,
  dot = false,
  floating = false,
}: Readonly<{ onClick: () => void; dot?: boolean; floating?: boolean }>) {
  return (
    <button
      type="button"
      className={`coach-btn${floating ? ' coach-btn--fab' : ''}`}
      aria-label="Hablar con el coach"
      onClick={onClick}
    >
      <IconSparkle size={22} />
      {dot && <span className="coach-btn__dot" aria-hidden="true" />}
    </button>
  )
}
