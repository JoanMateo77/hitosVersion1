/**
 * Ref de callback que enfoca el elemento al montarse. Hace lo mismo que el
 * atributo autoFocus y corre en el mismo momento (al insertar el nodo, antes de
 * los efectos), así que la trampa de foco de Sheet lo respeta igual.
 */
export function focusOnMount(el: HTMLElement | null): void {
  el?.focus()
}
