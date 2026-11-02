/** Lo que necesita el avatar para sus iniciales (encaja con useSession()). */
export interface AvatarIdentity {
  displayName: string
  email: string
}

/** Primer carácter visible (no parte un emoji ni una letra compuesta) en mayúscula. */
function firstChar(word: string): string {
  return (Array.from(word)[0] ?? '').toLocaleUpperCase('es')
}

/**
 * Iniciales del avatar sin foto, iguales en toda la app (Hoy, barra superior,
 * barra lateral y Perfil). Con nombre: inicial de las dos primeras palabras
 * ("María José" → "MJ"; "Carlos" → "C"). Sin nombre: primera letra del email.
 * Si no hay nada, '·'.
 */
export function avatarInitials({ displayName, email }: AvatarIdentity): string {
  const words = displayName.trim().split(/\s+/).filter((w) => w !== '')
  if (words.length > 0) return words.slice(0, 2).map(firstChar).join('')
  return firstChar(email.trim()) || '·'
}
