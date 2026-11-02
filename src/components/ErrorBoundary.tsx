import { Component, type ErrorInfo, type ReactNode } from 'react'
import { IconHito } from '@/components/icons'
import { isStaleChunkError, reloadOnceForStaleChunk } from '@/lib/staleChunk'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
  /** Mensaje técnico del error capturado — en chico, para poder reportarlo. */
  message: string | null
}

/**
 * Captura errores de render. El caso más común en producción es abrir la app
 * con módulos cacheados de una versión vieja justo después de un deploy: eso
 * se resuelve solo recargando (una vez, con guarda). Para el resto, mostramos
 * la pantalla de "acabamos de actualizar" con recarga manual.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, message: null }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || null }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la UI:', error, info)
    // Sin sessionStorage no auto-recargamos: el botón manual queda.
    if (isStaleChunkError(error)) reloadOnceForStaleChunk()
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="app">
        <div className="screen screen--full flow-screen">
          <div
            className="stack stack--lg center"
            style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}
          >
            <IconHito size={64} animate />
            <div className="stack stack--sm center">
              <h1 className="screen__title">¡Acabamos de actualizar la app!</h1>
              <p className="muted">Recarga para disfrutar las mejoras. Tu progreso está guardado.</p>
            </div>
            <div className="stack stack--sm" style={{ width: '100%', maxWidth: 300 }}>
              <button className="btn btn--primary btn--block" onClick={() => window.location.reload()}>
                Recargar
              </button>
              <button className="btn btn--ghost btn--block" onClick={() => window.location.assign('/')}>
                Ir a Hoy
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
