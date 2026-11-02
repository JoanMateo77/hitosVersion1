import { describe, expect, it } from 'vitest'
import {
  TYPE_NOTE_MAX,
  TYPE_QUESTION,
  aiSuggestion,
  answersWithTypeNote,
  effectiveTypeNote,
  parseTypeDraft,
  typeLabelFor,
} from '@/components/wizard/typeDraft'
import { TYPE_REASON_MAX } from '@/domain/goalType'

describe('parseTypeDraft', () => {
  it('acepta campos válidos', () => {
    const out = parseTypeDraft({
      templateKey: 'personalizada',
      typeNote: 'Aprender a cocinar para mi familia',
      typePicked: true,
      typeSuggestion: { key: 'finanzas', reason: 'Hablas de ahorrar', alternatives: ['emprender'], source: 'ai' },
    })
    expect(out).toEqual({
      templateKey: 'personalizada',
      typeNote: 'Aprender a cocinar para mi familia',
      typePicked: true,
      typeSuggestion: { key: 'finanzas', reason: 'Hablas de ahorrar', alternatives: ['emprender'], source: 'ai' },
    })
  })

  it('descarta tipos inexistentes, fuentes raras y basura', () => {
    expect(parseTypeDraft({ typeNote: 3, typePicked: 'sí', typeSuggestion: { key: 'nope', source: 'ai' } })).toEqual({})
    expect(parseTypeDraft({ typeSuggestion: { key: 'finanzas', source: 'hack' } })).toEqual({})
    expect(parseTypeDraft({ typeSuggestion: ['finanzas'] })).toEqual({})
  })

  it('limpia alternativas inválidas, repetidas o iguales al tipo', () => {
    const out = parseTypeDraft({
      typeSuggestion: {
        key: 'finanzas',
        reason: 1,
        alternatives: ['finanzas', 'x', 'emprender', 'emprender', 'personalizada', 'carrera', 'bienestar'],
        source: 'keywords',
      },
    })
    expect(out.typeSuggestion).toEqual({ key: 'finanzas', reason: '', alternatives: ['emprender', 'carrera'], source: 'keywords' })
  })

  it('acota el largo de la descripción', () => {
    expect(parseTypeDraft({ templateKey: 'personalizada', typeNote: 'a'.repeat(500) }).typeNote).toHaveLength(
      TYPE_NOTE_MAX,
    )
  })

  it('descarta la descripción si el tipo no es personalizada', () => {
    expect(parseTypeDraft({ templateKey: 'finanzas', typeNote: 'Cocinar' })).toEqual({ templateKey: 'finanzas' })
    expect(parseTypeDraft({ typeNote: 'Cocinar' })).toEqual({})
  })

  it('valida el tipo contra el catálogo', () => {
    expect(parseTypeDraft({ templateKey: 'finanzas' }).templateKey).toBe('finanzas')
    expect(parseTypeDraft({ templateKey: 'inventado' })).toEqual({})
    expect(parseTypeDraft({ templateKey: '' })).toEqual({})
    expect(parseTypeDraft({ templateKey: 7 })).toEqual({})
  })

  it('ignora alternativas que no son una lista', () => {
    const out = parseTypeDraft({ typeSuggestion: { key: 'finanzas', alternatives: 'emprender', source: 'ai' } })
    expect(out.typeSuggestion?.alternatives).toEqual([])
  })

  it('acota la razón guardada', () => {
    const out = parseTypeDraft({ typeSuggestion: { key: 'finanzas', reason: 'r'.repeat(500), source: 'ai' } })
    expect(out.typeSuggestion?.reason).toHaveLength(TYPE_REASON_MAX)
  })
})

describe('aiSuggestion', () => {
  it('rechaza claves fuera del catálogo', () => {
    expect(aiSuggestion({ key: 'inventado', reason: '', alternatives: [] })).toBeNull()
  })

  it('acota la razón a TYPE_REASON_MAX', () => {
    const s = aiSuggestion({ key: 'finanzas', reason: `  ${'x'.repeat(400)}  `, alternatives: [] })
    expect(s?.reason).toHaveLength(TYPE_REASON_MAX)
  })

  it('tolera alternativas que no son una lista (respuesta mal formada)', () => {
    const raw = { key: 'finanzas', reason: 'Ahorro', alternatives: null } as unknown as Parameters<typeof aiSuggestion>[0]
    expect(aiSuggestion(raw)?.alternatives).toEqual([])
  })
})

describe('descripción libre del tipo', () => {
  it('solo cuenta con el tipo personalizada', () => {
    expect(effectiveTypeNote('personalizada', '  Cocinar  ')).toBe('Cocinar')
    expect(effectiveTypeNote('', 'Cocinar')).toBe('Cocinar')
    expect(effectiveTypeNote('finanzas', 'Cocinar')).toBe('')
  })

  it('nombra el tipo ante el coach', () => {
    expect(typeLabelFor('personalizada', 'Cocinar')).toBe('Otra: Cocinar')
    expect(typeLabelFor('personalizada', '  ')).toBe('Meta personalizada')
    expect(typeLabelFor('finanzas', 'Cocinar')).toBe('Ahorrar / mejorar finanzas')
  })

  it('antepone la descripción a las respuestas guardadas', () => {
    const answers = [{ question: '¿Cuánto?', answer: 'Poco' }]
    expect(answersWithTypeNote(answers, 'personalizada', 'Cocinar')).toEqual([
      { question: TYPE_QUESTION, answer: 'Cocinar' },
      ...answers,
    ])
    expect(answersWithTypeNote(answers, 'finanzas', 'Cocinar')).toEqual(answers)
  })
})
