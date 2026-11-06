import { useCallback, useState } from 'react'
import type { ChatContext, StageChange } from '@/domain/coachChat'
import { useCoachChat } from '@/hooks/useCoachChat'
import { DESKTOP_QUERY, useMediaQuery } from '@/hooks/useMediaQuery'
import { addCoachMessages, listCoachMessages, setProposalStatus, type CoachMessage } from '@/services/goalCoach'
import { Sheet } from '@/components/Sheet'
import { CoachButton, CoachComposer, CoachOrb, CoachThread } from './CoachChatView'

const NUDGE_CHIPS = ['Tuve un imprevisto', 'Me cuesta acordarme', 'El plan era muy exigente']
const OPEN_CHIPS = ['¿Qué hago hoy?', 'Ya terminé algo', 'Voy atrasado']

function nudgeSeenKey(goalId: string) {
  return `logralo.coach-nudge.${goalId}.${new Date().toISOString().slice(0, 10)}`
}
function nudgeSeen(goalId: string): boolean {
  try {
    return sessionStorage.getItem(nudgeSeenKey(goalId)) === '1'
  } catch {
    return false
  }
}

/** Atajos bajo el chat: los de apertura si no hay mensajes, los del aviso si el último es el aviso. */
function suggestionChips(pending: boolean, messageCount: number, lastId: string | undefined): readonly string[] {
  if (pending) return []
  if (messageCount === 0) return OPEN_CHIPS
  return lastId === 'local-nudge' ? NUDGE_CHIPS : []
}

/**
 * "Hablar con la meta": botón ✦ flotante, globo cuando el coach tiene algo
 * útil que decir y la conversación (hoja en móvil, panel lateral en PC). La
 * conversación se guarda por meta: el coach recuerda lo que hablaron.
 */
export function GoalCoach({
  userId,
  goalId,
  subtitle,
  nudge,
  getContext,
  onApply,
  onLogProgress,
}: Readonly<{
  userId: string
  goalId: string
  /** Debajo del nombre: dónde va la persona (p. ej. "Etapa 2 de 4"). */
  subtitle: string
  nudge: string | null
  getContext: () => ChatContext
  onApply: (changes: StageChange[]) => Promise<void>
  /** Guarda en "Tus avances" la nota que la persona aceptó registrar. */
  onLogProgress: (note: string) => Promise<void>
}>) {
  const isDesktop = useMediaQuery(DESKTOP_QUERY)
  const [open, setOpen] = useState(false)
  const [loaded, setLoaded] = useState(false)
  const [bubble, setBubble] = useState(() => nudge !== null && !nudgeSeen(goalId))

  const persist = useCallback(
    (messages: Omit<CoachMessage, 'id' | 'createdAt'>[]) => addCoachMessages(userId, goalId, messages),
    [userId, goalId],
  )
  const persistStatus = useCallback((m: CoachMessage) => {
    if (m.proposal) void setProposalStatus(m.id, m.proposal)
  }, [])
  const chat = useCoachChat({ getContext, onApply, onLogProgress, persist, persistStatus })

  async function openChat() {
    setOpen(true)
    setBubble(false)
    try {
      sessionStorage.setItem(nudgeSeenKey(goalId), '1')
    } catch {
      /* ignore */
    }
    if (loaded) return
    setLoaded(true)
    const history = await listCoachMessages(goalId)
    // El aviso abre la conversación como mensaje del coach (no se guarda).
    const opener: CoachMessage[] = nudge
      ? [{ id: 'local-nudge', role: 'coach', text: nudge, proposal: null, createdAt: new Date().toISOString() }]
      : []
    chat.setMessages([...history, ...opener])
  }

  const last = chat.messages[chat.messages.length - 1]
  const chips = suggestionChips(chat.pending, chat.messages.length, last?.id)

  return (
    <>
      {bubble && nudge && !open && (
        <button type="button" className="coach-bubble" onClick={() => void openChat()}>
          {nudge}
          <small>Hablar con el coach</small>
        </button>
      )}
      {!open && <CoachButton floating dot={bubble} onClick={() => void openChat()} />}
      {open && (
        <Sheet
          label="Hablar con la meta"
          side={isDesktop}
          panelClassName="stack coach-sheet"
          onClose={() => setOpen(false)}
        >
          {(close) => (
            <>
              <div className="row" style={{ alignItems: 'center', gap: 'var(--s3)' }}>
                <CoachOrb thinking={chat.pending} />
                <div className="stack spacer" style={{ gap: 2, minWidth: 0 }}>
                  <strong>Coach de tu meta</strong>
                  <span className="small faint">{subtitle}</span>
                </div>
                <button type="button" className="btn--link" onClick={close}>
                  Cerrar
                </button>
              </div>
              <CoachThread
                chat={chat}
                empty={
                  <p className="small faint">
                    Cuéntale cómo vas, qué te frena o qué cambió. Te propone ajustes o registrar tus avances, y tú decides.
                  </p>
                }
              />
              {chips.length > 0 && (
                <div className="row wrap" style={{ gap: 'var(--s2)' }}>
                  {chips.map((t) => (
                    <button key={t} type="button" className="chip" onClick={() => void chat.send(t)}>
                      {t}
                    </button>
                  ))}
                </div>
              )}
              <CoachComposer onSend={(t) => void chat.send(t)} disabled={chat.pending} placeholder="Cuéntale cómo vas…" />
              <span className="tiny faint">El coach propone; ningún cambio se aplica sin tu sí.</span>
            </>
          )}
        </Sheet>
      )}
    </>
  )
}
