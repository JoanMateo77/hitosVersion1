import type { ComponentType } from 'react'
import type { NicheId } from '@/lib/types'
import { nicheAccent } from '@/lib/nicheAccent'
import {
  IconBook,
  IconBriefcase,
  IconBrush,
  IconCoins,
  IconGoals,
  IconHeartPulse,
  IconLeaf,
  IconUsers,
} from '@/components/icons'

interface NicheIconProps {
  size?: number
  className?: string
}

/** Ícono dibujado de cada área. Reemplaza a los emojis del sistema: mismo trazo
 *  en todas las plataformas, tinte por nicho vía CSS. */
const NICHE_ICONS: Record<NicheId, ComponentType<NicheIconProps>> = {
  salud: IconHeartPulse,
  finanzas: IconCoins,
  carrera: IconBriefcase,
  aprendizaje: IconBook,
  relaciones: IconUsers,
  creatividad: IconBrush,
  bienestar: IconLeaf,
  otra: IconGoals,
}

export function NicheIcon({ area, size = 18, className }: { area: NicheId } & NicheIconProps) {
  const Icon = NICHE_ICONS[area] ?? IconGoals
  return <Icon size={size} className={className} />
}

/** Tamaño del ícono dentro de cada disco. */
const GLYPH_ICON_PX = { sm: 14, md: 19, lg: 24, xl: 28 } as const

/**
 * Token de área: disco redondeado teñido con el color del nicho y su ícono.
 * Es el ancla visual de tarjetas de meta, cabeceras y listas (ex goal-card__emoji).
 */
export function NicheGlyph({
  area,
  size = 'md',
}: {
  area: NicheId
  /** xl: cabecera full color del detalle (56 px). */
  size?: 'sm' | 'md' | 'lg' | 'xl'
}) {
  return (
    <span className={`glyph glyph--${size}`} style={nicheAccent(area)} aria-hidden="true">
      <NicheIcon area={area} size={GLYPH_ICON_PX[size]} />
    </span>
  )
}
