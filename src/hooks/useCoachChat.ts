import { useCallback, useEffect, useRef, useState } from 'react'
import type { ChatContext, StageChange } from '@/domain/coachChat'
import { requestChat } from '@/services/goalPlan'
import type { CoachMessage, ProposalStatus } from '@/services/goalCoach'

interface UseCoachChatOptions {
  /** Contexto fresco en cada envío (etapas actuales, respuestas…). */
  getContext: () => ChatContext
  /** Aplica los cambios aceptados. Si lanza, la propuesta queda pendiente. */
  onApply: (changes: StageChange[]) => void | Promise<void>
  /** Registra el avance aceptado (solo el detalle de meta). Si lanza, queda pendiente. */
  onLogProgress?: (note: string) => void | Promise<void>
  initial?: CoachMessage[]
  /** Persistencia opcional (detalle de meta). Devuelve los mensajes con id real. */
  persist?: (messages: Omit<CoachMessage, 'id' | 'createdAt'>[]) => Promise<CoachMessage[]>
  persistStatus?: (message: CoachMessage) => void
}

let localId = 0
const tempId = () => `local-${++localId}`

/**
 * Estado de la conversación con el coach: enviar, esperar, aplicar o descartar
 * propuestas. Lo comparten el asistente de nueva meta y el detalle de meta.
 */
export function useCoachChat({
  getContext,
  onApply,
  onLogProgress,
  initial = [],
  persist,
  persistStatus,
}: UseCoachChatOptions) {
  const [messages, setMessages] = useState<CoachMessage[]>(initial)
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const messagesRef = useRef(messages)
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  const send = useCallback(
    async (text: string) => {
      const clean = text.trim()
      if (!clean || pending) return
      const history = messagesRef.current.map((m) => ({ role: m.role, text: m.text }))
      const mine: CoachMessage = { id: tempId(), role: 'user', text: clean, proposal: null, createdAt: new Date().toISOString() }
      setMessages((prev) => [...prev, mine])
      setPending(true)
      setError(null)
      try {
        const reply = await requestChat(getContext(), history, clean)
        const coach: CoachMessage = {
          id: tempId(),
          role: 'coach',
          text: reply.reply,
          proposal: reply.proposal ? { ...reply.proposal, status: 'pending' } : null,
          createdAt: new Date().toISOString(),
        }
        setMessages((prev) => [...prev, coach])
        if (persist) {
          const saved = await persist([
            { role: 'user', text: mine.text, proposal: null },
            { role: 'coach', text: coach.text, proposal: coach.proposal },
          ])
          // Cambiamos los ids locales por los reales (para marcar propuestas luego).
          if (saved.length === 2) {
            setMessages((prev) =>
              prev.map((m) => {
                if (m.id === mine.id) return { ...m, id: saved[0].id }
                return m.id === coach.id ? { ...m, id: saved[1].id } : m
              }),
            )
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'El coach no pudo responder ahora.')
      } finally {
        setPending(false)
      }
    },
    [getContext, pending, persist],
  )

  const setStatus = useCallback(
    (id: string, status: ProposalStatus) => {
      setMessages((prev) =>
        prev.map((m) => {
          if (m.id !== id || !m.proposal) return m
          const next = { ...m, proposal: { ...m.proposal, status } }
          if (!id.startsWith('local-')) persistStatus?.(next)
          return next
        }),
      )
    },
    [persistStatus],
  )

  const apply = useCallback(
    async (id: string) => {
      const proposal = messagesRef.current.find((m) => m.id === id)?.proposal
      if (proposal?.status !== 'pending') return
      const isProgress = proposal.kind === 'progress'
      try {
        if (proposal.kind === 'progress') {
          if (!onLogProgress) throw new Error('progress_not_supported')
          await onLogProgress(proposal.note)
        } else {
          await onApply(proposal.changes)
        }
        setStatus(id, 'applied')
      } catch {
        setError(isProgress ? 'No se pudo registrar el avance. Inténtalo de nuevo.' : 'No se pudo aplicar el cambio. Inténtalo de nuevo.')
      }
    },
    [onApply, onLogProgress, setStatus],
  )

  const dismiss = useCallback((id: string) => setStatus(id, 'dismissed'), [setStatus])

  return { messages, setMessages, pending, error, send, apply, dismiss }
}

export type CoachChat = ReturnType<typeof useCoachChat>
