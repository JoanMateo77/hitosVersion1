import type { ReactNode } from 'react'
import { useFirstTimeHint } from '@/hooks/useFirstTimeHint'
import { IconClose, IconLightbulb } from '@/components/icons'

interface HintProps {
  /** Identificador único — al cambiarlo, "resetea" el hint para todos los usuarios. */
  id: string
  children: ReactNode
}

/**
 * Banner explicativo de primera vez. Aparece una sola vez por dispositivo
 * (persistido vía useFirstTimeHint) y se descarta con ×. La idea es que la
 * app se explique sola sin sermonear: tono operativo, una frase, listo.
 */
export function Hint({ id, children }: HintProps) {
  const { visible, dismiss } = useFirstTimeHint(id)
  if (!visible) return null
  return (
    <div className="hint" role="note">
      <span className="hint__icon" aria-hidden="true">
        <IconLightbulb size={14} />
      </span>
      <span className="hint__body">{children}</span>
      <button className="hint__close" type="button" onClick={dismiss} aria-label="Entendido">
        <IconClose size={14} />
      </button>
    </div>
  )
}
