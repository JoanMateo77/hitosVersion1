import { Component, type ErrorInfo, type ReactNode } from 'react'

interface Props {
  children: ReactNode
}
interface State {
  hasError: boolean
}

/** Captura errores de render para mostrar una pantalla amable en vez de una en blanco. */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false }

  static getDerivedStateFromError(): State {
    return { hasError: true }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Error no controlado en la UI:', error, info)
  }

  render() {
    if (!this.state.hasError) return this.props.children
    return (
      <div className="app">
        <div className="screen screen--full">
          <div className="stack stack--lg center" style={{ flex: 1, justifyContent: 'center' }}>
            <div style={{ fontSize: 44 }}>😵‍💫</div>
            <h1 className="screen__title">Algo se rompió</h1>
            <p className="muted">Tuvimos un problema inesperado. Probá recargar la app.</p>
            <button className="btn btn--primary" onClick={() => window.location.reload()}>
              Recargar
            </button>
          </div>
        </div>
      </div>
    )
  }
}
