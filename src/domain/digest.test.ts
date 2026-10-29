import { describe, expect, it } from 'vitest'
import { digestBody, digestDue } from '../../supabase/functions/send-reminders/digest'

const today = '2026-10-28'
const yesterday = '2026-10-27'
const min = (h: number, m: number) => h * 60 + m

describe('digestDue', () => {
  it('envía dentro de la ventana si no se envió hoy', () => {
    expect(digestDue(min(7, 35), '07:30', yesterday, today)).toBe(true)
    expect(digestDue(min(7, 35), '07:30', null, today)).toBe(true)
  })
  it('no envía si ya se envió hoy', () => {
    expect(digestDue(min(7, 35), '07:30', today, today)).toBe(false)
  })
  it('no envía fuera de la ventana', () => {
    expect(digestDue(min(7, 45), '07:30', yesterday, today)).toBe(false)
    expect(digestDue(min(7, 25), '07:30', yesterday, today)).toBe(false)
  })
  it('no envía sin hora configurada', () => {
    expect(digestDue(min(7, 35), null, yesterday, today)).toBe(false)
  })
})

describe('digestBody', () => {
  it('lista hasta 3 títulos y cuenta el resto', () => {
    const r = digestBody(['A', 'B', 'C', 'D', 'E'], 2)
    expect(r.title).toBe('Tus metas de hoy')
    expect(r.body).toBe('A · B · C y 2 más. Hoy tienes 2 sesiones.')
  })
  it('usa singular con 1 sesión', () => {
    expect(digestBody(['A', 'B'], 1).body).toBe('A · B. Hoy tienes 1 sesión.')
  })
  it('avisa cuando no hay sesiones', () => {
    expect(digestBody(['A'], 0).body).toBe('A. Hoy no tienes sesiones agendadas.')
  })
})
