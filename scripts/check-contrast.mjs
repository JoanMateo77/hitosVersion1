// Contraste del sistema full color (spec 2026-11-02-full-color-design.md).
// Lee los tokens reales (tokens.css y fullcolor.css), aplica la misma mezcla
// que el navegador (color-mix en OKLCH a --intensity con gris #8c8c8c) y exige
// 4.5:1 (WCAG AA, texto normal) entre cada superficie y su tinta.
import { readFileSync } from 'node:fs'

const css = readFileSync('src/styles/tokens.css', 'utf8') + readFileSync('src/styles/fullcolor.css', 'utf8')
const token = (name) => {
  const m = css.match(new RegExp(String.raw`--${name}:\s*([^;]+);`))
  if (!m) throw new Error(`Falta el token --${name}`)
  const v = m[1].trim()
  const ref = v.match(/^var\(--([\w-]+)\)$/)
  return ref ? token(ref[1]) : v
}

// ---- Color: sRGB <-> OKLab, mezcla en OKLCH y contraste WCAG ----
const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toGam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const hex = (h) => [1, 3, 5].map((i) => Number.parseInt(h.slice(i, i + 2), 16) / 255)
function oklab([r, g, b]) {
  const [R, G, B] = [r, g, b].map(toLin)
  const l = Math.cbrt(0.4122214708 * R + 0.5363325363 * G + 0.0514459929 * B)
  const m = Math.cbrt(0.2119034982 * R + 0.6806995451 * G + 0.1073969566 * B)
  const s = Math.cbrt(0.0883024619 * R + 0.2817188376 * G + 0.6299787005 * B)
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ]
}
function srgb([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ].map((c) => Math.min(1, Math.max(0, toGam(c))))
}
/** color-mix(in oklch, a p, gris): el gris no tiene tono, se conserva el de a. */
function mixWithGray(a, p, gray) {
  const [L1, A1, B1] = oklab(hex(a))
  const [L2, A2, B2] = oklab(hex(gray))
  const C1 = Math.hypot(A1, B1)
  const H = Math.atan2(B1, A1)
  const L = L1 * p + L2 * (1 - p)
  const C = C1 * p + Math.hypot(A2, B2) * (1 - p)
  return srgb([L, C * Math.cos(H), C * Math.sin(H)])
}
const lum = (rgb) => {
  const [r, g, b] = rgb.map(toLin)
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (x, y) => (Math.max(lum(x), lum(y)) + 0.05) / (Math.min(lum(x), lum(y)) + 0.05)

const intensity = Number.parseFloat(token('intensity')) / 100
const vivid = (area) => mixWithGray(token(`vivid-base-${area}`), intensity, '#8c8c8c')
const AREAS = ['salud', 'finanzas', 'bienestar', 'carrera', 'aprendizaje', 'relaciones', 'creatividad', 'otra']
const HABITS = ['cyan', 'green', 'blue', 'purple', 'orange', 'yellow', 'pink', 'gray']
const MIN = 4.5

// Texto de interfaz por tema (bloques [data-theme] de tokens.css).
const tokens = readFileSync('src/styles/tokens.css', 'utf8')
const themeToken = (theme, name) => {
  const block = tokens.match(new RegExp(String.raw`\[data-theme='${theme}'\]\s*\{([^}]*)\}`))
  const m = block?.[1].match(new RegExp(String.raw`--${name}:\s*(#[0-9a-fA-F]{6});`))
  if (!m) throw new Error(`Falta --${name} en el tema ${theme}`)
  return hex(m[1])
}
const themePairs = ['claro', 'oscuro'].flatMap((t) => [
  [`${t}: tenue/fondo`, themeToken(t, 'bg'), themeToken(t, 'text-faint')],
  [`${t}: tenue/superficie`, themeToken(t, 'surface'), themeToken(t, 'text-faint')],
  [`${t}: acción/fondo`, themeToken(t, 'bg'), themeToken(t, 'action-text')],
  [`${t}: acción/superficie`, themeToken(t, 'surface'), themeToken(t, 'action-text')],
  // Placeholder y texto secundario dentro de campos (fondo surface-2).
  [`${t}: secundario/campo`, themeToken(t, 'surface-2'), themeToken(t, 'text-muted')],
])

// Razón del coach sobre la tarjeta de tipo elegida (asistente.css): la pastilla
// pinta la tinta del área sobre un velo de esa misma tinta. Se lee el % del velo
// de la regla real (0 si es transparente) y se mezcla en sRGB como el navegador.
const asistente = readFileSync('src/styles/screens/asistente.css', 'utf8')
const reasonRule = asistente.match(/\.type-card--on \.type-card__reason\s*\{([^}]*)\}/)?.[1]
if (!reasonRule) throw new Error('Falta la regla .type-card--on .type-card__reason en asistente.css')
const reasonTint =
  Number.parseFloat(reasonRule.match(/background:\s*color-mix\(in srgb, var\(--vivid-ink\) ([\d.]+)%/)?.[1] ?? '0') / 100
const mixSrgb = (a, b, p) => a.map((c, i) => c * (1 - p) + b[i] * p)
const reasonPairs = AREAS.map((a) => {
  const ink = hex(token(`vivid-ink-${a}`))
  return [`razón tipo ${a}`, mixSrgb(vivid(a), ink, reasonTint), ink]
})

const pairs = [
  ...themePairs,
  ...reasonPairs,
  ...AREAS.map((a) => [`área ${a}`, vivid(a), hex(token(`vivid-ink-${a}`))]),
  ['estado al día', mixWithGray(token('state-base-ok'), intensity, '#8c8c8c'), hex(token('state-ok-ink'))],
  ['estado atrasado', mixWithGray(token('state-base-late'), intensity, '#8c8c8c'), hex(token('state-late-ink'))],
  ['botón principal', hex(token('action')), hex(token('action-ink'))],
  ...HABITS.map((h) => [`hábito ${h}`, hex(token(`habit-${h}`)), hex(token('habit-ink'))]),
]

let failed = 0
for (const [label, bg, fg] of pairs) {
  const r = ratio(bg, fg)
  const ok = r >= MIN
  if (!ok) failed++
  console.log(`${ok ? 'ok ' : 'MAL'} ${label.padEnd(20)} ${r.toFixed(2)}:1`)
}
// Gramática: un área no puede parecerse al azul de acción ni a los estados.
const hueOf = (h) => {
  const [, a, b] = oklab(hex(h))
  return ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360
}
const MIN_HUE = 25
const reserved = [
  ['acción', token('action')],
  ['al día', token('state-base-ok')],
  ['atrasado', token('state-base-late')],
]
for (const area of AREAS.filter((a) => a !== 'otra')) {
  for (const [label, color] of reserved) {
    const d = Math.abs(hueOf(token(`vivid-base-${area}`)) - hueOf(color))
    const dist = Math.min(d, 360 - d)
    if (dist < MIN_HUE) {
      failed++
      console.log(`MAL área ${area} a ${dist.toFixed(0)}° de "${label}" (mínimo ${MIN_HUE}°)`)
    }
  }
}
// Hábitos: su color es identidad elegida, tampoco puede confundirse con acción
// ni estados. Gris queda exento (es neutro, como el área "otra").
for (const habit of HABITS.filter((h) => h !== 'gray')) {
  for (const [label, color] of reserved) {
    const d = Math.abs(hueOf(token(`habit-${habit}`)) - hueOf(color))
    const dist = Math.min(d, 360 - d)
    if (dist < MIN_HUE) {
      failed++
      console.log(`MAL hábito ${habit} a ${dist.toFixed(0)}° de "${label}" (mínimo ${MIN_HUE}°)`)
    }
  }
}

if (failed > 0) {
  console.error(`\n${failed} problemas. Ajusta el tono base o la tinta en tokens.css.`)
  process.exit(1)
}
console.log(`\nContraste OK (${pairs.length} pares ≥ ${MIN}:1 a intensidad ${token('intensity')}; áreas y hábitos a ≥ ${MIN_HUE}° de acción y estados)`)
