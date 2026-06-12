import { describe, expect, it } from 'vitest'
import { friendlyError, isUniqueViolation } from '@/lib/errors'

describe('isUniqueViolation', () => {
  it('reconoce el código 23505 de Postgres', () => {
    expect(isUniqueViolation({ code: '23505' })).toBe(true)
  })

  it('reconoce el mensaje de clave duplicada', () => {
    expect(isUniqueViolation(new Error('duplicate key value violates unique constraint'))).toBe(true)
  })

  it('reconoce la forma real que re-lanza createGoalTasks (Error con code)', () => {
    // tasks.ts re-lanza con: Object.assign(new Error(error.message), { code: error.code })
    const err = Object.assign(new Error('duplicate key value'), { code: '23505' })
    expect(isUniqueViolation(err)).toBe(true)
  })

  it('NO marca otros errores como duplicado', () => {
    expect(isUniqueViolation({ code: '42501' })).toBe(false) // RLS
    expect(isUniqueViolation(new Error('network error'))).toBe(false)
    expect(isUniqueViolation(null)).toBe(false)
  })

  it('NO matchea un mensaje que menciona "duplicate" pero no es de unicidad', () => {
    expect(isUniqueViolation(new Error('could not load duplicate template'))).toBe(false)
  })
})

describe('friendlyError', () => {
  const fallback = 'No se pudo cargar tu día.'

  it('traduce errores de red', () => {
    expect(friendlyError(new Error('Failed to fetch'), fallback)).toBe(
      'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.',
    )
    expect(friendlyError(new Error('NetworkError when attempting to fetch resource'), fallback)).toBe(
      'Hubo un problema de conexión. Revisa tu internet e inténtalo de nuevo.',
    )
  })

  it('traduce sesión expirada (JWT/refresh token/PGRST301)', () => {
    expect(friendlyError(new Error('JWT expired'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
    expect(friendlyError(new Error('Invalid Refresh Token: Already Used'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
    expect(friendlyError(new Error('PGRST301: JWT expired'), fallback)).toBe(
      'Tu sesión expiró. Vuelve a entrar para continuar.',
    )
  })

  it('traduce errores de permisos (RLS)', () => {
    expect(friendlyError(new Error('permission denied for table goals'), fallback)).toBe(
      'No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.',
    )
    expect(
      friendlyError(new Error('new row violates row-level security policy'), fallback),
    ).toBe('No tienes permisos para hacer eso. Vuelve a entrar e inténtalo de nuevo.')
  })

  it('cae al fallback del caller para errores desconocidos', () => {
    expect(friendlyError(new Error('duplicate key value violates unique constraint'), fallback)).toBe(fallback)
    expect(friendlyError('algo raro', fallback)).toBe(fallback)
    expect(friendlyError(null, fallback)).toBe(fallback)
  })
})
