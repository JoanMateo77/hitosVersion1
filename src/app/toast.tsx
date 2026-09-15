import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'default' | 'success' | 'warning'

interface ToastShape {
  id: number
  message: string
  tone: ToastTone
  /** Últimos 160 ms: el toast sale por animación en vez de desaparecer de golpe. */
  leaving?: boolean
}

interface ToastContextValue {
  toast: (message: string, tone?: ToastTone) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 3200
/** Debe coincidir con la duración de `.toast--leaving` en components.css. */
const LEAVE_MS = 160

/**
 * Toasts globales y efímeros: una sola pieza, el mensaje nuevo reemplaza al anterior.
 *
 * Reglas del sistema:
 * - Máximo 1 toast visible a la vez (cuando llega uno nuevo, el anterior cede).
 * - Tono operativo cálido, NO motivacional ("Guardado", "Saltada", no "¡Felicitaciones!").
 * - Los useCheer (celebraciones de primer/último check, hito) viven aparte: el toast
 *   es feedback de acción, el cheer es palmada en la espalda.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<ToastShape | null>(null)
  const timer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const nextId = useRef(1)

  const toast = useCallback((message: string, tone: ToastTone = 'default') => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    const id = nextId.current++
    setCurrent({ id, message, tone })
    // Dos tiempos: primero se marca la salida (anima), después se quita del DOM.
    leaveTimer.current = window.setTimeout(() => {
      setCurrent((prev) => (prev && prev.id === id ? { ...prev, leaving: true } : prev))
    }, AUTO_DISMISS_MS - LEAVE_MS)
    timer.current = window.setTimeout(() => {
      setCurrent((prev) => (prev && prev.id === id ? null : prev))
    }, AUTO_DISMISS_MS)
  }, [])

  useEffect(
    () => () => {
      if (timer.current !== null) window.clearTimeout(timer.current)
      if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    },
    [],
  )

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      {current && (
        <div
          className={`toast toast--${current.tone}${current.leaving ? ' toast--leaving' : ''}`}
          role="status"
          aria-live="polite"
        >
          {current.message}
        </div>
      )}
    </ToastContext.Provider>
  )
}

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext)
  if (!ctx) throw new Error('useToast debe usarse dentro de <ToastProvider>')
  return ctx
}
