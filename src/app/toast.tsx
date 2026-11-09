import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react'

export type ToastTone = 'default' | 'success' | 'warning'

export interface ToastAction {
  label: string
  onAction: () => void
}

export interface ToastOptions {
  /** Botón dentro del toast (p. ej. "Deshacer"). */
  action?: ToastAction
  /** ms visible; por defecto 3200, o 6000 si lleva acción (da tiempo de tocarla). */
  duration?: number
}

interface ToastShape {
  id: number
  message: string
  tone: ToastTone
  action?: ToastAction
  duration: number
  /** Últimos 160 ms: el toast sale por animación en vez de desaparecer de golpe. */
  leaving?: boolean
}

interface ToastContextValue {
  /** Muestra un toast y devuelve su id (para quitarlo antes con dismiss). */
  toast: (message: string, tone?: ToastTone, options?: ToastOptions) => number
  /** Quita el toast con ese id si sigue visible (p. ej. su "Deshacer" ya no aplica). */
  dismiss: (id: number) => void
}

const ToastContext = createContext<ToastContextValue | null>(null)

const AUTO_DISMISS_MS = 3200
const ACTION_DISMISS_MS = 6000
/** Debe coincidir con la duración de `.toast--leaving` en components.css. */
const LEAVE_MS = 160

/**
 * Toasts globales y efímeros: una sola pieza, el mensaje nuevo reemplaza al anterior.
 *
 * Reglas del sistema:
 * - Máximo 1 toast visible a la vez (cuando llega uno nuevo, el anterior cede).
 * - Tono operativo cálido, NO motivacional ("Guardado", "Saltada", no "¡Felicitaciones!").
 * - Con acción ("Deshacer") dura más y se detiene mientras el puntero o el foco
 *   están encima, para que alcance a tocarse.
 * - Los useCheer (celebraciones de primer/último check, hito) viven aparte: el toast
 *   es feedback de acción, el cheer es palmada en la espalda.
 */
export function ToastProvider({ children }: Readonly<{ children: ReactNode }>) {
  const [current, setCurrent] = useState<ToastShape | null>(null)
  const timer = useRef<number | null>(null)
  const leaveTimer = useRef<number | null>(null)
  const nextId = useRef(1)

  const clearTimers = useCallback(() => {
    if (timer.current !== null) window.clearTimeout(timer.current)
    if (leaveTimer.current !== null) window.clearTimeout(leaveTimer.current)
    timer.current = null
    leaveTimer.current = null
  }, [])

  // Dos tiempos: primero se marca la salida (anima), después se quita del DOM.
  const schedule = useCallback(
    (id: number, duration: number) => {
      clearTimers()
      leaveTimer.current = window.setTimeout(() => {
        setCurrent((prev) => (prev?.id === id ? { ...prev, leaving: true } : prev))
      }, duration - LEAVE_MS)
      timer.current = window.setTimeout(() => {
        setCurrent((prev) => (prev?.id === id ? null : prev))
      }, duration)
    },
    [clearTimers],
  )

  const toast = useCallback(
    (message: string, tone: ToastTone = 'default', options: ToastOptions = {}) => {
      const id = nextId.current++
      const duration = options.duration ?? (options.action ? ACTION_DISMISS_MS : AUTO_DISMISS_MS)
      setCurrent({ id, message, tone, action: options.action, duration })
      schedule(id, duration)
      return id
    },
    [schedule],
  )

  const dismiss = useCallback(
    (id: number) => {
      setCurrent((prev) => {
        if (prev?.id !== id) return prev
        clearTimers()
        return null
      })
    },
    [clearTimers],
  )

  useEffect(() => clearTimers, [clearTimers])

  const value = useMemo(() => ({ toast, dismiss }), [toast, dismiss])

  const hold = () => {
    if (current?.action && !current.leaving) clearTimers()
  }
  const release = () => {
    if (current?.action && !current.leaving) schedule(current.id, current.duration)
  }

  return (
    <ToastContext.Provider value={value}>
      {children}
      {current && (
        <div
          className={`toast toast--${current.tone}${current.action ? ' toast--action' : ''}${current.leaving ? ' toast--leaving' : ''}`}
          role="status"
          aria-live="polite"
          onPointerEnter={hold}
          onPointerLeave={release}
          onFocus={hold}
          onBlur={release}
        >
          <span className="toast__message">{current.message}</span>
          {current.action && (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                const { action, id } = current
                dismiss(id)
                action?.onAction()
              }}
            >
              {current.action.label}
            </button>
          )}
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
