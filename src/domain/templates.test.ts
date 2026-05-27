import { describe, expect, it } from 'vitest'
import { TEMPLATES, detectTemplate, getTemplate, templatesForNiche } from '@/domain/templates'

describe('detectTemplate', () => {
  it('detecta por palabras clave del título', () => {
    expect(detectTemplate('Aprender inglés').key).toBe('aprender_habilidad')
    expect(detectTemplate('Bajar 5 kg y correr').key).toBe('salud_fisico')
  })
  it('sin señales claras -> personalizada', () => {
    expect(detectTemplate('algo totalmente ambiguo').key).toBe('personalizada')
  })
})

describe('getTemplate', () => {
  it('cae en personalizada para clave desconocida', () => {
    expect(getTemplate('no-existe').key).toBe('personalizada')
  })
})

describe('templatesForNiche', () => {
  it('pone las del nicho primero y no pierde ninguna', () => {
    const list = templatesForNiche('finanzas')
    expect(list).toHaveLength(TEMPLATES.length)
    expect(list[0].defaultArea).toBe('finanzas')
  })
})
