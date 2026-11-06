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
}: Readonly<{ onSend: (text: string) => void; disabled?: boolean; placeholder?: string; autoFocus?: boolean }>) {
  const [text, setText] = useState('')
  // Foco por ref y no con el atributo autoFocus (accesibilidad, regla de Sonar).
  const inputRef = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (autoFocus) inputRef.current?.focus()
  }, [autoFocus])
  return (
    <form
      className="coach-composer"
      onSubmit={(e) => {
        e.preventDefault()
        if (!text.trim() || disabled) return
        onSend(text)
        setText('')
      }}
    >
      <input
        aria-label="Escríbele al coach"
        placeholder={placeholder}
        value={text}
        maxLength={600}
        ref={inputRef}
        enterKeyHint="send"
        autoCapitalize="sentences"
        onChange={(e) => setText(e.target.value)}
      />
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
          <ul className="coach-proposal__list">
            {proposal.changes.map((c) => (
              <li key={`${c.kind}-${c.title}`} className="small">
                {describe(c)}
              </li>
            ))}
          </ul>
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
