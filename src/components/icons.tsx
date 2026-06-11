import type { CSSProperties } from 'react'

/** Set de íconos como SVG inline (sin dependencias). Heredan currentColor.
 *
 * El stroke-width se escala con el tamaño — un 2px sobre 16px se ve "duro" comparado
 * con el mismo 2px sobre 28px. base(size) calibra la línea para que se sienta consistente. */
interface IconProps {
  size?: number
  className?: string
  /** Override puntual (color, margin, etc.). Para casos limitados — preferí className. */
  style?: CSSProperties
}

function base(size: number) {
  const strokeWidth = size <= 16 ? 1.6 : size <= 22 ? 1.85 : 2
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  }
}

export function IconToday({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" />
    </svg>
  )
}

export function IconGoals({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <circle cx="12" cy="12" r="5" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconProfile({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  )
}

export function IconPlus({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  )
}

export function IconCheck({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M20 6L9 17l-5-5" />
    </svg>
  )
}

export function IconBack({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M15 18l-6-6 6-6" />
    </svg>
  )
}

export function IconClose({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M18 6L6 18M6 6l12 12" />
    </svg>
  )
}

export function IconPencil({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  )
}

export function IconSparkles({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6Z" />
      <path d="M19 14l.8 2.2L22 17l-2.2.8L19 20l-.8-2.2L16 17l2.2-.8Z" />
    </svg>
  )
}

/** Logo de marca de Hito: un camino ascendente con hitos, el último alcanzado. */
export function IconHito({
  size = 22,
  className,
  style,
  animate = false,
}: IconProps & { animate?: boolean }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="-1 -1 26 26"
      fill="none"
      stroke="currentColor"
      strokeWidth={size <= 22 ? 1.85 : 2}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={animate ? [className, 'celebrate-pop'].filter(Boolean).join(' ') : className}
      style={style}
      aria-hidden="true"
    >
      {/* El check de Lógralo: dos barras gruesas en L, rotadas 40°. */}
      <g transform="translate(12 12.3) scale(0.79) rotate(40) translate(-12 -12)" stroke="none">
        <rect x="12.7" y="3" width="4.9" height="18" rx="1.5" fill="currentColor" />
        <rect x="5.5" y="16.1" width="12.1" height="4.9" rx="1.5" fill="currentColor" />
      </g>
    </svg>
  )
}

export function IconCalendar({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="16" rx="2.5" />
      <path d="M3 9.5h18M8 2.5v4M16 2.5v4" />
    </svg>
  )
}

/** Estrella de "foco" — línea limpia, no la estrella sticker. */
export function IconStar({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 3.5l2.6 5.4 5.9.8-4.3 4.1 1 5.9L12 17l-5.3 2.7 1-5.9L3.5 9.7l5.9-.8z" />
    </svg>
  )
}

/** Brote — meta olvidada que vuelve a la vida sin culpa. */
export function IconSprout({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 21V11" />
      <path d="M12 11C12 7.5 9 5.5 5 5.5C5 9.5 8 11 12 11Z" />
      <path d="M12 11C12 8 14.5 6 18 6C18 9 16 11 12 11Z" />
    </svg>
  )
}

/** Comillas — usar para revisar / reflexionar / "tu porqué". */
export function IconQuote({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M7 8c-2 0-3 1.5-3 3.5C4 14 5.5 16 8 16M8 8l-1 8" />
      <path d="M17 8c-2 0-3 1.5-3 3.5C14 14 15.5 16 18 16M18 8l-1 8" />
    </svg>
  )
}

/** Bandera — meta logrado / hito cumplido. */
export function IconFlag({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M5 21V4" />
      <path d="M5 4h11l-2 3.5L16 11H5" />
    </svg>
  )
}

/** Reloj — "esta semana le dedicaste X". */
export function IconClock({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3.5 2" />
    </svg>
  )
}

/** Bombilla — sugerencias / ideas. */
export function IconLightbulb({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-4 10.5L9 15v3h6v-3l1-1.5A6 6 0 0 0 12 3Z" />
    </svg>
  )
}

/** Brújula — empty state: "encontrá tu rumbo". */
export function IconCompass({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M15.5 8.5L13.5 14L8.5 15.5L10.5 10L15.5 8.5Z" />
    </svg>
  )
}

/** Flecha "de retorno" — meta de origen de una tarea (reemplaza el unicode ↳). */
export function IconArrowReturn({ size = 12, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M6 6V11C6 12.1 6.9 13 8 13H19" />
      <path d="M16 10L19 13L16 16" />
    </svg>
  )
}

/** Chevron derecho — reemplaza el unicode ›. */
export function IconChevronRight({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M9 6L15 12L9 18" />
    </svg>
  )
}

/** Triángulo "play" / siguiente paso — reemplaza el unicode ▶. */
export function IconPlay({ size = 14, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M7 5L18 12L7 19V5Z" fill="currentColor" stroke="none" />
    </svg>
  )
}

/** Confeti — celebración al lograr meta. */
export function IconCelebrate({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M4 20L9 8L16 15L4 20Z" />
      <path d="M14 4L15 6M17 5L18 7M19 9L21 9M12 8L14 10" />
    </svg>
  )
}

export function IconProgress({ size = 24, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <polyline points="3 16.5 9 10.5 13 14.5 21 6.5" />
      <polyline points="15 6.5 21 6.5 21 12.5" />
    </svg>
  )
}
