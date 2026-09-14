import type { ReactNode } from 'react'
import { IconChevronRight } from '@/components/icons'

/**
 * Desplegable nativo (<details>) con la gramática de "desplegar hacia abajo"
 * que usa toda la app para plegar historia, metadatos y explicaciones. Sin
 * estado en React: el navegador recuerda si está abierto mientras la pantalla
 * viva. El resumen es un texto corto ("Ver todos (12)", "Detalles").
 */
export function Disclosure({
  summary,
  defaultOpen = false,
  className,
  children,
}: {
  summary: ReactNode
  defaultOpen?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <details className={`disclosure${className ? ` ${className}` : ''}`} open={defaultOpen}>
      <summary className="disclosure__summary">
        <span className="disclosure__label">{summary}</span>
        <span className="disclosure__chev" aria-hidden="true">
          <IconChevronRight size={16} />
        </span>
      </summary>
      <div className="disclosure__body">{children}</div>
    </details>
  )
}
