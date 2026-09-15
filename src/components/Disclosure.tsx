import { useEffect, useId, useState, type ReactNode } from 'react'
import { IconChevronRight } from '@/components/icons'

/**
 * Desplegable con la gramática de "desplegar hacia abajo" de toda la app.
 * Botón + cuerpo siempre en el árbol: el cuerpo se pliega con
 * grid-template-rows (animable) y queda inert cuando está cerrado.
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
  const [open, setOpen] = useState(defaultOpen)
  // Igual que <details open={x}>: si el padre cambia defaultOpen, se sigue.
  useEffect(() => setOpen(defaultOpen), [defaultOpen])
  const id = useId()
  return (
    <div className={`disclosure${open ? ' disclosure--open' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        className="disclosure__summary"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
      >
        <span className="disclosure__label">{summary}</span>
        <span className="disclosure__chev" aria-hidden="true">
          <IconChevronRight size={16} />
        </span>
      </button>
      <div className="disclosure__wrap">
        <div className="disclosure__body" id={id} inert={!open}>
          {children}
        </div>
      </div>
    </div>
  )
}
