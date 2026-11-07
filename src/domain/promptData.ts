/**
 * Texto de la persona (o del cliente) dentro de un prompt. Va siempre entre
 * etiquetas tipo <mensaje>…</mensaje>; sin < ni > no puede cerrar la etiqueta
 * que lo envuelve ni abrir otra que parezca instrucción de la app.
 * Corre en el servidor: sin imports con alias.
 */
export function asData(text: unknown, max = 200): string {
  if (typeof text !== 'string') return ''
  return text.replace(/\s+/g, ' ').trim().slice(0, max).replaceAll('<', '‹').replaceAll('>', '›')
}
