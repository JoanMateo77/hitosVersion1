import { describe, expect, it } from 'vitest'
import {
  applyStageChanges,
  buildChatPrompt,
  buildCriteriaPrompt,
  parseCoachReply,
  parseCriteria,
  readHistory,
  readStages,
  type ChatContext,
} from './coachChat'

const stages = [
  { title: 'Definir el modelo y el presupuesto', done: true },
  { title: 'Ahorrar la cuota inicial' },
  { title: 'Sacar la licencia de conducción' },
  { title: 'Comprar la moto' },
]

const ctx: ChatContext = { title: 'Comprar mi primera moto', typeLabel: 'Ahorro', area: 'finanzas', stages }

describe('parseCoachReply', () => {
  it('normaliza títulos a la grafía de la persona y arma la propuesta', () => {
    const r = parseCoachReply(
      {
        reply: 'Si ya tienes la licencia, esa etapa sobra.',
        proposalSummary: 'Quitar la licencia.',
        changes: [{ kind: 'remove', title: 'sacar la licencia de conducción' }],
      },
      stages,
    )
    expect(r?.proposal?.changes).toEqual([{ kind: 'remove', title: 'Sacar la licencia de conducción' }])
    expect(r?.proposal?.summary).toBe('Quitar la licencia.')
  })

  it('ignora la numeración que el modelo copia del prompt', () => {
    const r = parseCoachReply(
      { reply: 'Sobra.', proposalSummary: 'x', changes: [{ kind: 'remove', title: '3. Sacar la licencia de conducción' }] },
      stages,
    )
    expect(r?.proposal?.changes).toEqual([{ kind: 'remove', title: 'Sacar la licencia de conducción' }])
  })

  it('descarta cambios sobre etapas inexistentes o cumplidas', () => {
    const r = parseCoachReply(
      {
        reply: 'Ok.',
        proposalSummary: 'x',
        changes: [
          { kind: 'remove', title: 'Algo que no existe' },
          { kind: 'rename', title: 'Definir el modelo y el presupuesto', newTitle: 'Otra' },
        ],
      },
      stages,
    )
    expect(r).toEqual({ reply: 'Ok.', proposal: null })
  })

  it('no agrega una etapa que ya existe y resuelve el ancla', () => {
    const r = parseCoachReply(
      {
        reply: 'Te sugiero un colchón.',
        proposalSummary: 'Agregar fondo.',
        changes: [
          { kind: 'add', title: 'Comprar la moto' },
          { kind: 'add', title: 'Separar un fondo para imprevistos', afterTitle: 'ahorrar la cuota inicial' },
          { kind: 'add', title: 'Revisar ofertas', afterTitle: '' },
          { kind: 'add', title: 'Cotizar el seguro', afterTitle: 'Inventada' },
        ],
      },
      stages,
    )
    expect(r?.proposal?.changes).toEqual([
      { kind: 'add', title: 'Separar un fondo para imprevistos', afterTitle: 'Ahorrar la cuota inicial' },
      { kind: 'add', title: 'Revisar ofertas', afterTitle: null },
      { kind: 'add', title: 'Cotizar el seguro' },
    ])
  })

  it('rechaza respuestas sin texto', () => {
    expect(parseCoachReply({ reply: '  ', changes: [] }, stages)).toBeNull()
    expect(parseCoachReply('hola', stages)).toBeNull()
  })

  it('limita la cantidad de cambios', () => {
    const changes = Array.from({ length: 8 }, (_, i) => ({ kind: 'add', title: `Etapa ${i}` }))
    expect(parseCoachReply({ reply: 'x', proposalSummary: '', changes }, stages)?.proposal?.changes).toHaveLength(4)
  })
})

describe('applyStageChanges', () => {
  const titles = stages.map((s) => s.title)
  it('quita, renombra y agrega en su lugar', () => {
    const next = applyStageChanges(titles, [
      { kind: 'remove', title: 'Sacar la licencia de conducción' },
      { kind: 'rename', title: 'Comprar la moto', newTitle: 'Comprar la moto usada' },
      { kind: 'add', title: 'Fondo de imprevistos', afterTitle: 'Ahorrar la cuota inicial' },
      { kind: 'add', title: 'Primero', afterTitle: null },
      { kind: 'add', title: 'Último' },
    ])
    expect(next).toEqual([
      'Primero',
      'Definir el modelo y el presupuesto',
      'Ahorrar la cuota inicial',
      'Fondo de imprevistos',
      'Comprar la moto usada',
      'Último',
    ])
  })
})

describe('parseCriteria', () => {
  it('se queda con hasta 3 opciones válidas y sin repetidas', () => {
    const r = parseCriteria({
      options: [
        { text: 'Tengo la moto a mi nombre', why: 'El resultado final' },
        { text: 'tengo la moto a mi nombre', why: 'Repetida' },
        { text: 'Sin motivo', why: '' },
        { text: 'Junté 4,5 millones', why: 'Un número' },
        { text: 'Practiqué 6 sábados', why: 'Constancia' },
        { text: 'Sobra', why: 'Cuarta' },
      ],
    })
    expect(r?.map((o) => o.text)).toEqual(['Tengo la moto a mi nombre', 'Junté 4,5 millones', 'Practiqué 6 sábados'])
  })
  it('null si no hay opciones', () => {
    expect(parseCriteria({ options: [] })).toBeNull()
  })
})

describe('prompts', () => {
  it('el chat delimita los datos y marca etapas cumplidas', () => {
    const p = buildChatPrompt(ctx, [{ role: 'user', text: 'hola' }, { role: 'coach', text: 'hola, ¿cómo vas?' }], 'Ya tengo la licencia')
    expect(p).toContain('1. Definir el modelo y el presupuesto (cumplida)')
    expect(p).toContain('<mensaje_nuevo>Ya tengo la licencia</mensaje_nuevo>')
    expect(p).toContain('<persona>hola</persona><coach>hola, ¿cómo vas?</coach>')
  })
  it('el criterio incluye el pedido de la persona solo si existe', () => {
    expect(buildCriteriaPrompt(ctx, 'sin deudas')).toContain('<pedido>sin deudas</pedido>')
    expect(buildCriteriaPrompt(ctx)).not.toContain('<pedido>')
  })
})

describe('lectores de entrada', () => {
  it('readHistory filtra basura y limita', () => {
    expect(readHistory([{ role: 'user', text: 'a' }, null, { role: 'x', text: 'b' }, { text: '' }])).toEqual([
      { role: 'user', text: 'a' },
      { role: 'user', text: 'b' },
    ])
  })
  it('readStages acepta strings u objetos', () => {
    expect(readStages(['Uno', { title: 'Dos', done: true }, 3])).toEqual([
      { title: 'Uno' },
      { title: 'Dos', done: true },
    ])
  })
})
