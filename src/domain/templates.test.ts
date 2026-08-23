import { describe, expect, it } from 'vitest'
import { TEMPLATES, detectTemplate, getTemplate, templatesForNiche } from '@/domain/templates'

describe('detectTemplate', () => {
  it('detecta por palabras clave del título', () => {
    expect(detectTemplate('Aprender inglés').key).toBe('aprender_habilidad')
    expect(detectTemplate('Bajar 5 kg y correr').key).toBe('salud_fisico')
  })
  it('detecta sinónimos y aliases comunes (cobertura ampliada)', () => {
    expect(detectTemplate('Preparar las oposiciones').key).toBe('academico')
    expect(detectTemplate('Hacer un MBA').key).toBe('academico')
    expect(detectTemplate('Correr una maratón').key).toBe('salud_fisico')
    expect(detectTemplate('Dejar de fumar').key).toBe('bienestar')
    expect(detectTemplate('Lanzar mi marca personal').key).toBe('crear_publicar')
    expect(detectTemplate('Aprender Python').key).toBe('aprender_habilidad')
    expect(detectTemplate('Salir de deudas').key).toBe('finanzas')
    expect(detectTemplate('Conseguir un nuevo laburo').key).toBe('carrera')
    expect(detectTemplate('Invertir en la bolsa').key).toBe('finanzas')
  })
  it('distingue crecer en el trabajo actual, buscar trabajo y emprender', () => {
    expect(detectTemplate('Mejorar en mi trabajo y ser el mejor').key).toBe('crecer_trabajo')
    expect(detectTemplate('Ganarme un ascenso este año').key).toBe('crecer_trabajo')
    expect(detectTemplate('Conseguir un trabajo nuevo').key).toBe('carrera')
    expect(detectTemplate('Emprender mi negocio').key).toBe('emprender')
    expect(detectTemplate('Conseguir mis primeras ventas').key).toBe('emprender')
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
