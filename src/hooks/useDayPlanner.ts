import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { minutesToTime } from '@/domain/clock'
import {
  DAY_DEFAULTS,
  applyEffect,
  mergeAiItems,
  conflictQuestions,
  countChanges,
  isAddOnly,
  planDay,
  planToOps,
  type DayContextHabit,
  type DayItem,
  type DayOption,
  type DayQuestion,
} from '@/domain/dayPlan'
import { DAY_MAX_QUESTIONS, type DayAiReply } from '@/domain/dayPlanAi'
import { autoDecision } from '@/domain/dayAuto'
import { failedOpTitle, runOps, undoOps, type DayOpExecutors, type DoneOp } from '@/domain/dayOps'
import { requestDayPlan } from '@/services/goalPlan'

export interface DayMessage {
  id: string
  role: 'user' | 'coach'
  text: string
}

interface UseDayPlannerOptions {
  date: string
  /** Minuto actual si el día es hoy; null para otros días. */
  nowMin: number | null
  baseItems: DayItem[]
  habits: DayContextHabit[]
  goals: Array<{ id: string; title: string }>
  executors: DayOpExecutors
}

const AUTO_KEY = 'logralo.dayplan.auto'

function readAuto(): boolean {
  try {
    return localStorage.getItem(AUTO_KEY) === '1'
  } catch {
    return false
  }
}

let localId = 0
const nextId = () => `day-${++localId}`

const minutesNow = () => {
  const d = new Date()
  return d.getHours() * 60 + d.getMinutes()
}

/**
 * Estado de la hoja "Organizar el día": conversación con la IA, borrador,
 * preguntas (las del algoritmo primero), aplicar y deshacer. Nada se guarda
 * hasta `apply()`, salvo en modo "Aplicar solo" (domain/dayAuto.ts).
 * Specs: docs/superpowers/specs/2026-11-07-ia-organizar-dia-design.md §5 y
 * 2026-11-08-organizar-dia-claridad-y-auto-design.md
 */
export function useDayPlanner({ date, nowMin, baseItems, habits, goals, executors }: UseDayPlannerOptions) {
  const [messages, setMessages] = useState<DayMessage[]>([])
  const [items, setItems] = useState<DayItem[]>(baseItems)
  const [aiQuestions, setAiQuestions] = useState<DayAiReply['questions']>([])
  const [assumptions, setAssumptions] = useState<string[]>([])
  const [pending, setPending] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [done, setDone] = useState<DoneOp[] | null>(null)
  // Modo "Aplicar solo": se recuerda en el dispositivo (spec 2026-11-08 §5).
  const [auto, setAutoState] = useState(readAuto)
  const setAuto = useCallback((on: boolean) => {
    try {
      localStorage.setItem(AUTO_KEY, on ? '1' : '0')
    } catch {
      /* sin almacenamiento: vale para esta vez */
    }
    setAutoState(on)
  }, [])

  // Lo último confirmado, para no depender de cierres viejos al enviar.
  const itemsRef = useRef(items)
  const messagesRef = useRef(messages)
  useEffect(() => {
    itemsRef.current = items
    messagesRef.current = messages
  }, [items, messages])

  const plan = useMemo(() => planDay({ items, nowMin }), [items, nowMin])
  const ops = useMemo(() => planToOps(plan, items, habits), [plan, items, habits])

  const questions = useMemo<DayQuestion[]>(() => {
    const fromAi: DayQuestion[] = aiQuestions.map((q, i) => ({
      id: `ai:${i}:${q.text}`,
      from: 'ai',
      text: q.text,
      options: q.options.map((label) => ({ label, reply: label })),
    }))
    return [...conflictQuestions(plan, items), ...fromAi].slice(0, DAY_MAX_QUESTIONS)
  }, [plan, items, aiQuestions])

  /** true si la IA respondió (la respuesta ya está en el borrador). */
  const send = useCallback(
    async (text: string): Promise<boolean> => {
      const clean = text.trim()
      // Ni mientras guarda ni ya aplicado: el borrador dejaría de ser lo guardado.
      if (!clean || pending || saving || done) return false
      const history = messagesRef.current.map((m) => ({ role: m.role, text: m.text }))
      setMessages((prev) => [...prev, { id: nextId(), role: 'user', text: clean }])
      setPending(true)
      setError(null)
      try {
        const reply = await requestDayPlan(
          {
            date,
            now: minutesToTime(minutesNow()),
            dayStart: DAY_DEFAULTS.dayStart,
            dayEnd: DAY_DEFAULTS.dayEnd,
            items: itemsRef.current,
            goals,
          },
          history,
          clean,
        )
        setItems((prev) => mergeAiItems(prev, reply.items))
        setAiQuestions(reply.questions)
        setAssumptions(reply.assumptions)
        setMessages((prev) => [...prev, { id: nextId(), role: 'coach', text: reply.reply }])
        return true
      } catch (err) {
        setError(err instanceof Error ? err.message : 'No pudimos organizar tu día ahora.')
        return false
      } finally {
        setPending(false)
      }
    },
    [date, goals, pending, saving, done],
  )

  const choose = useCallback(
    (question: DayQuestion, option: DayOption) => {
      if ('effect' in option) {
        setItems((prev) => applyEffect(prev, option.effect))
        return
      }
      // Respuesta a una pregunta de la IA: vuelve a la IA como mensaje de la
      // persona. La pregunta solo se va si la IA respondió (si falla, sigue).
      void send(option.reply).then((ok) => {
        if (ok) setAiQuestions((prev) => prev.filter((q) => q.text !== question.text))
      })
    },
    [send],
  )

  const editItem = useCallback((ref: string, patch: Partial<DayItem>) => {
    setItems((prev) =>
      prev.map((i) => {
        if (i.ref !== ref) return i
        const next = { ...i, ...patch }
        // Fija sin hora no existe: pasa a flexible.
        return next.fixed && !next.start ? { ...next, fixed: false } : next
      }),
    )
  }, [])

  const apply = useCallback(async () => {
    if (saving || done || ops.length === 0) return
    setSaving(true)
    setError(null)
    try {
      const result = await runOps(ops, executors)
      setDone(result.done)
      if (result.failed) {
        const title = failedOpTitle(result.failed, new Map(items.map((i) => [i.ref, i.title])))
        setError(
          `No se pudo guardar ${title ? `«${title}»` : 'un cambio'}. Lo que sí se guardó lo puedes deshacer.`,
        )
      }
    } finally {
      setSaving(false)
    }
  }, [done, executors, items, ops, saving])

  const undo = useCallback(async () => {
    if (!done || saving) return
    setSaving(true)
    setError(null)
    try {
      await undoOps(done, executors)
      setDone(null)
    } catch {
      setError('No se pudo deshacer todo. Revisa tu agenda.')
    } finally {
      setSaving(false)
    }
  }, [done, executors, saving])

  // En automático se aplica en cuanto la IA respondió y no queda nada por
  // preguntar, solo si el borrador únicamente agrega: mover lo que la persona
  // ya tenía siempre lo revisa ella.
  const [autoUsedAt, setAutoUsedAt] = useState(-1)
  const autoState = autoDecision({
    auto,
    lastFromAi: messages.at(-1)?.role === 'coach',
    messageCount: messages.length,
    usedAt: autoUsedAt,
    addOnly: isAddOnly(ops),
    changes: ops.length,
    questions: questions.length,
    pending,
    saving,
    applied: done !== null,
    error: error !== null,
  })
  useEffect(() => {
    if (!autoState.apply) return
    setAutoUsedAt(messages.length)
    void apply()
  }, [autoState.apply, apply, messages.length])

  return {
    messages,
    ops,
    auto,
    setAuto,
    /** En automático, el borrador mueve algo existente y espera que la persona guarde. */
    needsReview: autoState.needsReview,
    items,
    plan,
    questions,
    assumptions,
    pending,
    saving,
    error,
    changes: countChanges(ops),
    applied: done !== null,
    send,
    choose,
    editItem,
    apply,
    undo,
  }
}

export type DayPlanner = ReturnType<typeof useDayPlanner>
