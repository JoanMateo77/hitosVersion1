import type { CSSProperties } from 'react'
import { useSession } from '@/app/session'
import type { Frame } from '@/domain/frames'
import { avatarInitials } from '@/lib/avatar'

interface UserAvatarProps {
  /** Marco ganado con la racha (anillo); null = avatar neutro, sin anillo. */
  frame: Frame | null
  /** 'md' = 36 px (barras, Hoy) · 'lg' = 64 px (Perfil). */
  size?: 'md' | 'lg'
  /**
   * Texto que anuncia el avatar. Sin él es decorativo (aria-hidden): es lo
   * correcto cuando el nombre ya está escrito al lado o el control que lo
   * envuelve ya tiene su etiqueta.
   */
  label?: string
  className?: string
}

/**
 * Avatar canónico del usuario: la foto o sus iniciales, con el anillo del
 * marco ganado con la racha (ver src/domain/frames.ts). Sin marco no hay
 * anillo: el avatar es neutro, no una acción.
 */
export function UserAvatar({ frame, size = 'md', label, className }: UserAvatarProps) {
  const { displayName, email, profile } = useSession()
  const classes = ['avatar']
  if (size === 'lg') classes.push('avatar--lg')
  if (frame) classes.push('avatar--ring')
  if (className) classes.push(className)
  const style = frame ? ({ '--avatar-ring': frame.color } as CSSProperties) : undefined
  const a11y = label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true as const }

  return (
    <span className={classes.join(' ')} style={style} {...a11y}>
      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="" /> : avatarInitials({ displayName, email })}
    </span>
  )
}
