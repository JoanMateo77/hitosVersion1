interface LoadingScreenProps {
  error?: string | null
}

/** Pantalla de carga a pantalla completa; muestra el error si algo falló.
 *  Spinner = tres puntos verdes en stagger, los hitos del camino caminando. */
export function LoadingScreen({ error }: LoadingScreenProps) {
  return (
    <div className="screen loading-screen">
      {error ? (
        <div className="stack center" style={{ maxWidth: 320, alignItems: 'center' }}>
          <p className="muted">{error}</p>
          <button className="btn btn--ghost" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="spinner" role="status" aria-label="Cargando">
          <span />
          <span />
          <span />
        </div>
      )}
    </div>
  )
}
