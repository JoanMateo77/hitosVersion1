/**
 * Modo "Aplicar solo" de "Organizar el día": cuándo se guarda sin tocar el
 * botón y cuándo se le pide a la persona que revise. Lógica pura (la usa
 * useDayPlanner). Spec: docs/superpowers/specs/2026-11-08-organizar-dia-claridad-y-auto-design.md §5
 */
export interface AutoInput {
  auto: boolean
  /** El último mensaje es de la IA (respondió y su borrador ya está). */
  lastFromAi: boolean
  messageCount: number
  /** Cantidad de mensajes cuando se aplicó solo por última vez (-1 = nunca). */
  usedAt: number
  /** El borrador solo agrega (no mueve nada que ya existía). */
  addOnly: boolean
  changes: number
  questions: number
  pending: boolean
  saving: boolean
  applied: boolean
  error: boolean
}

export function autoDecision(s: AutoInput): { apply: boolean; needsReview: boolean } {
  const settled = s.auto && s.lastFromAi && s.changes > 0 && s.questions === 0 && !s.pending && !s.saving && !s.applied
  return {
    // Una vez por respuesta de la IA: tras "Deshacer" no se vuelve a aplicar solo.
    apply: settled && s.addOnly && !s.error && s.usedAt !== s.messageCount,
    // Mover lo que la persona ya tenía nunca es automático: lo revisa ella.
    needsReview: settled && !s.addOnly,
  }
}
