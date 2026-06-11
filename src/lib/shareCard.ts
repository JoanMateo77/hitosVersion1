/**
 * Tarjeta de logro compartible (motor orgánico del spec §2): una imagen
 * cuadrada con el logro + la marca. Cada share lleva el call-to-action en el
 * nombre. Canvas puro, sin dependencias.
 */

interface AchievementCard {
  /** "Logré mi meta" / "Etapa cumplida" */
  kicker: string
  /** El título de la meta o etapa. */
  title: string
  /** Línea de datos: "5 etapas · 12 h invertidas". */
  stats: string
}

const W = 1080
const H = 1080

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(' ')
  const lines: string[] = []
  let line = ''
  for (const w of words) {
    const probe = line ? `${line} ${w}` : w
    if (ctx.measureText(probe).width > maxWidth && line) {
      lines.push(line)
      line = w
    } else {
      line = probe
    }
  }
  if (line) lines.push(line)
  return lines.slice(0, 4)
}

async function drawCard(card: AchievementCard): Promise<HTMLCanvasElement> {
  const canvas = document.createElement('canvas')
  canvas.width = W
  canvas.height = H
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas no disponible')

  // Fondo crema cálido con halo naranja
  ctx.fillStyle = '#faf5ec'
  ctx.fillRect(0, 0, W, H)
  const halo = ctx.createRadialGradient(W * 0.8, H * 0.1, 0, W * 0.8, H * 0.1, W * 0.9)
  halo.addColorStop(0, 'rgba(249, 115, 22, 0.16)')
  halo.addColorStop(1, 'rgba(249, 115, 22, 0)')
  ctx.fillStyle = halo
  ctx.fillRect(0, 0, W, H)

  // Marca (esquina superior izquierda): el MISMO favicon de la app, estampado.
  // Una sola fuente de verdad — la tarjeta nunca diverge del ícono.
  try {
    const icon = new Image()
    icon.src = '/favicon.svg?v=3'
    await icon.decode()
    ctx.drawImage(icon, 96, 92, 168, 168)
  } catch {
    /* sin ícono la tarjeta sigue siendo válida */
  }

  // Kicker
  ctx.fillStyle = '#75664e'
  ctx.font = '600 44px Manrope, sans-serif'
  ctx.fillText(card.kicker.toUpperCase(), 96, 420)

  // Título (display, multilínea)
  ctx.fillStyle = '#261d12'
  ctx.font = '600 96px Fraunces, Georgia, serif'
  const lines = wrapText(ctx, card.title, W - 192)
  lines.forEach((l, i) => ctx.fillText(l, 96, 540 + i * 116))

  // Stats
  ctx.fillStyle = '#15803d'
  ctx.font = '700 48px Manrope, sans-serif'
  ctx.fillText(card.stats, 96, 540 + lines.length * 116 + 60)

  // Wordmark
  ctx.fillStyle = '#ea580c'
  ctx.font = '800 56px Manrope, sans-serif'
  ctx.fillText('LOGRALO', 96, H - 96)
  ctx.fillStyle = '#75664e'
  ctx.font = '500 40px Manrope, sans-serif'
  ctx.fillText('· metas con compromiso', 96 + 290, H - 96)

  return canvas
}

/**
 * Comparte la tarjeta: imagen vía Web Share API si el dispositivo lo permite;
 * si no, texto plano; si tampoco, descarga la imagen. Devuelve qué pasó.
 */
export async function shareAchievement(card: AchievementCard): Promise<'shared' | 'downloaded'> {
  // Sin las fuentes de marca cargadas, el canvas caería a Georgia/sans.
  await document.fonts?.ready?.catch?.(() => {})
  const canvas = await drawCard(card)
  const text = `${card.kicker}: ${card.title} — ${card.stats}. Hecho con Lógralo.`

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (blob) {
    const file = new File([blob], 'logro.png', { type: 'image/png' })
    if (navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], text })
        return 'shared'
      } catch {
        /* usuario canceló o falló: caemos al siguiente método */
      }
    }
  }
  if (navigator.share) {
    try {
      await navigator.share({ text })
      return 'shared'
    } catch {
      /* idem */
    }
  }
  // Último recurso: descargar la imagen.
  const url = canvas.toDataURL('image/png')
  const a = document.createElement('a')
  a.href = url
  a.download = 'logro.png'
  a.click()
  return 'downloaded'
}
