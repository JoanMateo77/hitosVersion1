import { describe, expect, it } from 'vitest'
import { buildTypePrompt, parseTypeSuggestion, typeResponseSchema } from './goalType'

const KEYS = ['crear_publicar', 'emprender', 'aprender_habilidad', 'personalizada']
const CATALOG = [
  { key: 'crear_publicar', label: 'Crear o publicar algo', description: 'Lanzar un proyecto.' },
  { key: 'emprender', label: 'Emprender', description: 'Validar una idea.' },
]

describe('parseTypeSuggestion', () => {
  it('acepta una clave válida con razón y alternativas', () => {
    expect(
      parseTypeSuggestion(
        { key: 'emprender', reason: '  Quieres  vender  ', alternatives: ['crear_publicar'] },
        KEYS,
      ),
    ).toEqual({ key: 'emprender', reason: 'Quieres vender', alternatives: ['crear_publicar'] })
  })

  it('rechaza una clave que no existe', () => {
    expect(parseTypeSuggestion({ key: 'inventada', reason: 'x', alternatives: [] }, KEYS)).toBeNull()
    expect(parseTypeSuggestion(null, KEYS)).toBeNull()
  })

  it('limpia alternativas: sin la elegida, sin personalizada, sin repetidas, máximo dos', () => {
    const r = parseTypeSuggestion(
      {
        key: 'emprender',
        reason: '',
        alternatives: ['emprender', 'personalizada', 'crear_publicar', 'crear_publicar', 'aprender_habilidad', 'otra'],
      },
      KEYS,
    )
    expect(r?.alternatives).toEqual(['crear_publicar', 'aprender_habilidad'])
  })
})

describe('buildTypePrompt', () => {
  it('lista el catálogo y encierra los datos de la persona en etiquetas', () => {
    const p = buildTypePrompt('Lanzar mi app de metas', 'quiero vivir de esto', CATALOG)
    expect(p).toContain('<tipo clave="emprender">')
    expect(p).toContain('<meta>Lanzar mi app de metas</meta>')
    expect(p).toContain('<porque>quiero vivir de esto</porque>')
  })

  it('omite el porqué si no hay', () => {
    expect(buildTypePrompt('Correr 10K', null, CATALOG)).not.toContain('<porque>')
  })
})

describe('typeResponseSchema', () => {
  it('restringe las claves al catálogo', () => {
    const s = typeResponseSchema(KEYS) as { properties: { key: { enum: string[] } } }
    expect(s.properties.key.enum).toEqual(KEYS)
  })
})
