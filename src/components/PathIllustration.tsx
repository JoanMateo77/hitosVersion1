/**
 * Ilustración de marca: un camino punteado con etapas que termina en un
 * banderín. Es la idea de Lógralo (llegar por etapas) dibujada plana.
 *
 * Color con significado: todo neutro (camino en borde, banderín en `--text`).
 * El azul es para actuar y esto no se toca, así que no lleva azul. Cuando la
 * ilustración habla de UNA meta, `stopColor` pinta las etapas cumplidas en el
 * color de su área (p. ej. `var(--vivid)`); sin área, quedan neutras.
 * Para estados vacíos y celebraciones; decorativa, oculta al lector de pantalla.
 */
export function PathIllustration({
  width = 220,
  /** done = cuántas etapas aparecen cumplidas (rellenas). */
  done = 3,
  /** Color de las etapas cumplidas; neutro por defecto. */
  stopColor = 'var(--text-muted)',
  className,
}: Readonly<{ width?: number; done?: number; stopColor?: string; className?: string }>) {
  const stops = [
    { x: 20, y: 150 },
    { x: 110, y: 110 },
    { x: 190, y: 70 },
  ]
  return (
    <svg
      viewBox="0 0 240 170"
      width={width}
      height={(width * 170) / 240}
      className={className}
      aria-hidden="true"
      focusable="false"
    >
      <path
        d="M20 150 C70 150 70 110 110 110 S150 70 190 70"
        fill="none"
        stroke="var(--border)"
        strokeWidth="6"
        strokeLinecap="round"
        strokeDasharray="2 14"
      />
      {stops.map((s, i) => (
        <circle
          key={s.x}
          cx={s.x}
          cy={s.y}
          r="13"
          fill={i < done ? stopColor : 'var(--surface)'}
          stroke={i < done ? 'none' : 'var(--border)'}
          strokeWidth="4"
        />
      ))}
      <path d="M190 70 V18" stroke="var(--text)" strokeWidth="4" strokeLinecap="round" />
      <path d="M190 18 h34 l-8 11 8 11 h-34z" fill="var(--text)" />
    </svg>
  )
}
