import { describe, expect, it } from 'vitest'
import { isUniqueViolation } from '@/lib/errors'

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
