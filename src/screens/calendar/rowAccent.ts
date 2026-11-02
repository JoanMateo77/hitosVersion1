import type { CSSProperties } from 'react'
import type { HabitColor } from '@/lib/types'
import { habitColor } from '@/domain/habits'
import { nicheAccent } from '@/lib/nicheAccent'
import { rowArea, type AgendaRowItem } from '@/screens/calendar/agendaItems'

/**
 * Color de un hábito con los mismos nombres que publica `nicheAccent`, para
 * que la agenda lo pinte igual que Hábitos (su color es identidad elegida por
 * el usuario, no el del área). Tinta: `--habit-ink`.
 */
function habitAccent(color: HabitColor): CSSProperties {
  return {
    '--niche': `var(--habit-${color})`,
    '--vivid': `var(--habit-${color})`,
    '--vivid-ink': 'var(--habit-ink)',
    '--vivid-lip': `var(--habit-${color}-g2)`,
  } as CSSProperties
}

/** Clave del color de una fila: el hábito por su color, lo demás por su área. */
export function rowAccentKey(item: AgendaRowItem): string {
  return item.kind === 'habit' ? `habit-${habitColor(item.habit.habit)}` : `area-${rowArea(item)}`
}

/** Estilo de color de una fila: hábito = su color (como en Hábitos); resto = área. */
export function rowAccent(item: AgendaRowItem): CSSProperties {
  return item.kind === 'habit' ? habitAccent(habitColor(item.habit.habit)) : nicheAccent(rowArea(item))
}
