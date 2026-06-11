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

/**
 * Token de área: disco redondeado teñido con el color del nicho y su ícono.
 * Es el ancla visual de tarjetas de meta, cabeceras y listas (ex goal-card__emoji).
 */
export function NicheGlyph({
  area,
  size = 'md',
}: {
  area: NicheId
  size?: 'sm' | 'md' | 'lg'
}) {
  const px = size === 'sm' ? 14 : size === 'md' ? 19 : 24
  return (
    <span className={`glyph glyph--${size}`} style={nicheAccent(area)} aria-hidden="true">
      <NicheIcon area={area} size={px} />
    </span>
  )
}
