import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

/**
 * Cada vez que cambia la ruta, llevamos el scroll arriba — comportamiento
 * que espera cualquier app nativa (entrar a una pantalla nueva = empezás
 * desde el top). Si se requiere "scroll restore" real (volver a la posición
 * previa al usar back) habría que migrar a createBrowserRouter + ScrollRestoration.
 */
export function useScrollToTop() {
  const { pathname } = useLocation()
  useEffect(() => {
    window.scrollTo(0, 0)
  }, [pathname])
}
