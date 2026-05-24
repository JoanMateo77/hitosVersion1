interface LoadingScreenProps {
  error?: string | null
}

/** Pantalla de carga a pantalla completa; muestra el error si algo falló. */
export function LoadingScreen({ error }: LoadingScreenProps) {
  return (
    <div className="screen loading-screen">
      {error ? (
        <div className="stack center" style={{ maxWidth: 320 }}>
          <div className="empty__emoji">😕</div>
          <p className="muted">{error}</p>
          <button className="btn btn--ghost" onClick={() => window.location.reload()}>
            Reintentar
          </button>
        </div>
      ) : (
        <div className="spinner" role="status" aria-label="Cargando" />
      )}
    </div>
  )
}
