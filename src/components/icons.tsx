import type { CSSProperties } from 'react'
// El logo viaja DENTRO del bundle (hash de Vite): cada versión de la app trae
// su logo amarrado — un service worker viejo ya no puede mostrar uno desfasado.
import logoUrl from '@/assets/logo.svg'

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

/** Logo de marca de Lógralo. Renderiza EXACTAMENTE el mismo asset que el
 *  favicon y el ícono instalado (public/favicon.svg): un solo original
 *  aprobado, cero divergencias entre la app, la pestaña y el teléfono. */
export function IconHito({
  size = 22,
  className,
  style,
  animate = false,
}: IconProps & { animate?: boolean }) {
  return (
    <img
      src={logoUrl}
      width={size}
      height={size}
      className={animate ? [className, 'celebrate-pop'].filter(Boolean).join(' ') : className}
      style={style}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
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

/** Triángulo de alerta — pantalla de error y avisos serios. */
export function IconAlert({ size = 20, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M10.2 4.2 2.8 17.5a2 2 0 0 0 1.8 3h14.8a2 2 0 0 0 1.8-3L13.8 4.2a2 2 0 0 0-3.6 0Z" />
      <path d="M12 9.5v4.5" />
      <circle cx="12" cy="17" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  )
}

/* ===== Tema / momento del día ============================================ */

export function IconSun({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="12" r="4.2" />
      <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3L19 19M19 5l-1.7 1.7M6.7 17.3L5 19" />
    </svg>
  )
}

export function IconMoon({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M20.4 14.2A8.2 8.2 0 0 1 9.8 3.6a8.2 8.2 0 1 0 10.6 10.6Z" />
    </svg>
  )
}

/** Monitor — tema "sistema". */
export function IconSystem({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <rect x="3" y="4.5" width="18" height="13" rx="2.5" />
      <path d="M9 21h6M12 17.5V21" />
    </svg>
  )
}

/** Amanecer — momento "mañana". */
export function IconSunrise({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 9.5V2.8M8.8 5.2L12 2l3.2 3.2" />
      <path d="M5.3 17.5a6.7 6.7 0 0 1 13.4 0" />
      <path d="M2 21h20M3 17.5h1M20 17.5h1" />
    </svg>
  )
}

/* ===== Estados y acciones ================================================ */

/** Llama — racha de días cumplidos. */
export function IconFlame({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 21.5c3.9 0 6.5-2.5 6.5-6.2 0-2.6-1.4-4.6-2.9-6.3-.8 1-1.4 1.5-2.2 2-.2-3-1.3-6-4-8.5.2 2.6-.6 4.4-2 6C5.9 10.2 5.5 12 5.5 15.3c0 3.7 2.6 6.2 6.5 6.2Z" />
      <path d="M12 21.5c1.9 0 3.2-1.3 3.2-3.2 0-1.4-.9-2.5-2-3.6-.9 1-2.2 1.6-3.4 2.7-.6.5-1 1.2-1 2 .1 1.1 1.3 2.1 3.2 2.1Z" />
    </svg>
  )
}

export function IconPause({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M9 5.5v13M15 5.5v13" />
    </svg>
  )
}

/** Tres puntos — "más opciones". */
export function IconDots({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="5" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.1" fill="currentColor" stroke="none" />
      <circle cx="19" cy="12" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  )
}

export function IconShare({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 14.5V3.5M8.5 6.5L12 3l3.5 3.5" />
      <path d="M5.5 11.5H5a2 2 0 0 0-2 2V19a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-5.5a2 2 0 0 0-2-2h-.5" />
    </svg>
  )
}

export function IconTrash({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M4 6.5h16M9.5 6.5V4.8a1.3 1.3 0 0 1 1.3-1.3h2.4a1.3 1.3 0 0 1 1.3 1.3v1.7" />
      <path d="M6.2 6.5l.8 13a1.8 1.8 0 0 0 1.8 1.7h6.4a1.8 1.8 0 0 0 1.8-1.7l.8-13" />
    </svg>
  )
}

export function IconArrowUp({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  )
}

export function IconArrowDown({ size = 16, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  )
}

/** Cronómetro — sesiones medidas. */
export function IconTimer({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 10v4l2.6 1.5M9.5 2.5h5M12 2.5V6" />
    </svg>
  )
}

/** Ruta con paradas — "un camino por etapas". */
export function IconRoute({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="6" cy="19" r="2.4" />
      <circle cx="18" cy="5" r="2.4" />
      <path d="M8.4 19H15a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h6.6" />
    </svg>
  )
}

/* ===== Áreas (nichos) — un trazo por área, mismo lenguaje del set ======== */

/** Corazón con pulso — salud y cuerpo. */
export function IconHeartPulse({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 20.5S3 14.7 3 8.9C3 6 5.2 4 7.7 4c1.8 0 3.3 1 4.3 2.5C13 5 14.5 4 16.3 4 18.8 4 21 6 21 8.9c0 5.8-9 11.6-9 11.6Z" />
      <path d="M6.5 12h3l1.5-3 2 5 1.5-2.5h3" />
    </svg>
  )
}

/** Monedas — finanzas. */
export function IconCoins({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <ellipse cx="12" cy="6" rx="7.5" ry="3.2" />
      <path d="M4.5 6v6c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2V6" />
      <path d="M4.5 12v6c0 1.8 3.4 3.2 7.5 3.2s7.5-1.4 7.5-3.2v-6" />
    </svg>
  )
}

/** Maletín — carrera y trabajo. */
export function IconBriefcase({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <rect x="3" y="7.5" width="18" height="12.5" rx="2.5" />
      <path d="M8.5 7.5V6A2 2 0 0 1 10.5 4h3a2 2 0 0 1 2 2v1.5M3 12.5h18" />
    </svg>
  )
}

/** Libro abierto — aprendizaje. */
export function IconBook({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M12 6.5C10.5 4.8 8.2 4 5.5 4c-1 0-1.9.1-2.5.3v14.4c.6-.2 1.5-.3 2.5-.3 2.7 0 5 .8 6.5 2.5 1.5-1.7 3.8-2.5 6.5-2.5 1 0 1.9.1 2.5.3V4.3C20.4 4.1 19.5 4 18.5 4c-2.7 0-5 .8-6.5 2.5Z" />
      <path d="M12 6.5v14.4" />
    </svg>
  )
}

/** Dos personas — relaciones. */
export function IconUsers({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20c0-3.3 2.9-5 6.5-5s6.5 1.7 6.5 5" />
      <path d="M16 4.8a3.5 3.5 0 0 1 0 6.4M18.2 15.4c2 .7 3.3 2.2 3.3 4.6" />
    </svg>
  )
}

/** Pincel — crear y publicar. */
export function IconBrush({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M20.8 3.2c-3.6 1.5-7.4 4.6-9.6 7.6l2 2c3-2.2 6.1-6 7.6-9.6Z" />
      <path d="M9.5 12.5c-1.7.2-2.9 1-3.5 2.3-.7 1.4-.4 3-1.5 4.2-.3.3-.6.6-1 .8 1 .5 2.3.7 3.4.6 1.6-.2 3-1 3.7-2.4.5-1 .6-2.2.4-3.3" />
    </svg>
  )
}

/** Hoja — bienestar. */
export function IconLeaf({ size = 18, className, style }: IconProps) {
  return (
    <svg {...base(size)} className={className} style={style} aria-hidden="true">
      <path d="M5 19C5 9.5 11 4 20.5 3.5 21 13 15.5 19 6 19" />
      <path d="M3.5 20.5C7 17 10.5 13.5 14 10" />
    </svg>
  )
}
