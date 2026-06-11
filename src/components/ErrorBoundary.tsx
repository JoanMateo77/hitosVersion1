import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconAlert } from '@/components/icons'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  /** Mensaje técnico del error capturado — visible en chico para poder reportarlo. */
  message: string | null
}

/** Captura errores de render para mostrar una pantalla amable en vez de una en blanco. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la UI:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="app">
        <div className="screen screen--full">
          <div className="stack stack--lg center" style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
            <span className="empty__icon">
              <IconAlert size={32} />
            </span>
            <div className="stack stack--sm center">
              <h1 className="screen__title">Algo se rompió</h1>
              <p className="muted">Tuvimos un problema inesperado. Intenta volver al inicio o recargar.</p>
            </div>
            <div className="stack stack--sm" style={{ width: '100%', maxWidth: 280 }}>
              <button
                className="btn btn--primary btn--block"
                onClick={() => window.location.assign('/')}
              >
                Ir a Hoy
              </button>
              <button
                className="btn btn--ghost btn--block"
                onClick={() => window.location.reload()}
              >
                Recargar
              </button>
            </div>
            {this.state.message && (
              <p className="faint tiny center" style={{ maxWidth: 420, wordBreak: 'break-word' }}>
                Detalle técnico: {this.state.message}
              </p>
            )}
          </div>
        </div>
      </div>
    )
  }
}
