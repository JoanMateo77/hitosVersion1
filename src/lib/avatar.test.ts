import { describe, expect, it } from 'vitest'
import { avatarInitials } from '@/lib/avatar'

describe('avatarInitials', () => {
  it('con nombre de dos o más palabras usa la inicial de las dos primeras', () => {
    expect(avatarInitials({ displayName: 'María José', email: 'x@y.com' })).toBe('MJ')
    expect(avatarInitials({ displayName: '  ana  maría  pérez ', email: 'x@y.com' })).toBe('AM')
  })

  it('con nombre de una palabra usa su inicial', () => {
    expect(avatarInitials({ displayName: 'carlos', email: 'x@y.com' })).toBe('C')
  })

  it('respeta letras acentuadas', () => {
    expect(avatarInitials({ displayName: 'Íñigo Ñúñez', email: 'x@y.com' })).toBe('ÍÑ')
  })

  it('sin nombre usa la primera letra del email', () => {
    expect(avatarInitials({ displayName: '', email: 'luisa@x.com' })).toBe('L')
    expect(avatarInitials({ displayName: '   ', email: ' ana@x.com' })).toBe('A')
  })

  it('sin nombre ni email devuelve un punto', () => {
    expect(avatarInitials({ displayName: '', email: '' })).toBe('·')
  })
})
