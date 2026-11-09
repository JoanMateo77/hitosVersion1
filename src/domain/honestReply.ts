/**
 * Nada se guarda hasta que la persona acepta: la respuesta de la IA propone, no
 * informa lo hecho. Dominio puro, imports relativos (lo carga el servidor).
 */

// Verbos con los que un modelo da por hecho algo que todavía es una propuesta.
// Participios solo con "he" ("un día organizado" no afirma nada); pretéritos solos.
// "puse/organicé/creé" solo con "ya" (sin él suelen describir el borrador).
const PARTICIPLES =
  'programado|agendado|guardado|agregado|añadido|organizado|puesto|creado|reservado|anotado|configurado|agrupado|quitado|eliminado|cambiado|renombrado|registrado|aplicado|actualizado|armado|preparado|diseñado|ajustado|dejado'
const PAST =
  'programé|agendé|guardé|agregué|añadí|reservé|anoté|configuré|quité|eliminé|cambié|renombré|registré|apliqué|actualicé|armé|preparé|diseñé|ajusté'
const CLAIM = `(?:(?:ya\\s+)?(?:(?:te\\s+)?he\\s+(?:${PARTICIPLES})|${PAST})|ya\\s+(?:puse|organicé|creé)|quedó\\s+(?:agendad|guardad|programad|reservad)[ao]s?|quedaron\\s+(?:agendad|guardad|programad|reservad)[ao]s)`
// \b no entiende tildes ("agendé"): los bordes de palabra se miran con \p{L}.
const LEADING_CLAIM = new RegExp(`^(?:listo|hecho|perfecto)?[,.!]?\\s*${CLAIM}(?!\\p{L})`, 'iu')
const ANY_CLAIM = new RegExp(`(?<!\\p{L})${CLAIM}(?!\\p{L})`, 'giu')

/** Si el modelo dice "programé/agregué…", se reescribe como propuesta. */
export function honestReply(reply: string): string {
  if (!new RegExp(ANY_CLAIM.source, 'iu').test(reply)) return reply
  return reply.replace(LEADING_CLAIM, 'Te propongo').replace(ANY_CLAIM, (_claim, offset: number, all: string) => {
    const before = all.slice(0, offset).trimEnd()
    return before === '' || /[.!?…]$/u.test(before) ? 'Te propongo' : 'propongo'
  })
}
