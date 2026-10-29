// Lógica pura del resumen diario (sin imports: sirve a Deno y a Vitest).

const WINDOW_MIN = 10

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

/** ¿Toca enviar el resumen? Ventana [hora, hora+10 min] y solo una vez por día local. */
export function digestDue(
  nowMin: number,
  digestTime: string | null,
  sentOn: string | null,
  todayLocal: string,
): boolean {
  if (!digestTime || sentOn === todayLocal) return false
  const at = minutesOf(digestTime.slice(0, 5))
  return nowMin >= at && nowMin <= at + WINDOW_MIN
}

export function digestBody(
  goalTitles: string[],
  sessionsToday: number,
): { title: string; body: string } {
  const shown = goalTitles.slice(0, 3).join(' · ')
  const rest = goalTitles.length - 3
  const goals = rest > 0 ? `${shown} y ${rest} más` : shown
  const sessions =
    sessionsToday === 0
      ? 'Hoy no tienes sesiones agendadas.'
      : `Hoy tienes ${sessionsToday} ${sessionsToday === 1 ? 'sesión' : 'sesiones'}.`
  return { title: 'Tus metas de hoy', body: `${goals}. ${sessions}` }
}
