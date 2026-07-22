/**
 * Intención de destino al terminar el onboarding.
 *
 * El paso final del onboarding no navega a mano: marca el perfil como onboarded
 * y la ruta `/onboarding` redirige sola. Pero esa ruta necesita saber si el
 * usuario pulsó "Crear mi primera meta" (→ asistente) o "Prefiero mirar primero"
 * (→ Hoy). Guardamos esa intención en sessionStorage para que el redirect la lea.
 *
 * La bandera se limpia al montar el asistente (Wizard), no en el render del
 * redirect: leer-y-borrar en render rompería con el doble render de StrictMode.
 */
export const GOTO_WIZARD_KEY = 'logralo:onboarding-goto-wizard'

/** ¿El usuario terminó el onboarding pidiendo crear su primera meta? */
export function wantsWizardAfterOnboarding(): boolean {
  try {
    return sessionStorage.getItem(GOTO_WIZARD_KEY) === '1'
  } catch {
    return false
  }
}

/** Consume la intención (al montar el asistente), para que no reaparezca luego. */
export function clearWizardIntent(): void {
  try {
    sessionStorage.removeItem(GOTO_WIZARD_KEY)
  } catch {
    // sessionStorage inaccesible (modo privado extremo): sin intención que limpiar.
  }
}
