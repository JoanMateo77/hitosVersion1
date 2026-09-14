/**
 * Háptico: el acuse de recibo que se siente, no el que se ve.
 *
 * Reglas:
 * - Solo al MARCAR (nunca al desmarcar): vibrar cuando el usuario deshace es ruido.
 * - Nunca es el único feedback — siempre acompaña algo visible (check, toast, pop).
 * - `navigator.vibrate` no existe en iOS ni en escritorio: ahí no pasa nada y
 *   la app se comporta igual.
 */

/** Toque corto: un check, una repetición marcada. */
export function tapHaptic(): void {
  navigator.vibrate?.(10)
}

/** Patrón de logro: etapa cumplida, meta lograda. Se usa con moderación. */
export function successHaptic(): void {
  navigator.vibrate?.([12, 40, 12])
}
