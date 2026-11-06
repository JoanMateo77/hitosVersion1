import { describe, expect, it } from 'vitest'
import {
  applyStageChanges,
  buildChatPrompt,
  buildCriteriaPrompt,
  parseCoachReply,
  parseCriteria,
  PROGRESS_NOTE_MAX,
  readHistory,
  readStages,
  readStoredProposal,
  type ChatContext,
  type CoachReply,
} from './coachChat'

const stages = [
  { title: 'Definir el modelo y el presupuesto', done: true },
  { title: 'Ahorrar la cuota inicial' },
  { title: 'Sacar la licencia de conducción' },
  { title: 'Comprar la moto' },
]

const ctx: ChatContext = { title: 'Comprar mi primera moto', typeLabel: 'Ahorro', area: 'finanzas', stages }

function changesOf(r: CoachReply | null) {
  return r?.proposal?.kind === 'stages' ? r.proposal.changes : undefined
}

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
    expect(r?.proposal).toEqual({
      kind: 'stages',
      summary: 'Quitar la licencia.',
      changes: [{ kind: 'remove', title: 'Sacar la licencia de conducción' }],
    })
  })

  it('ignora la numeración aunque traiga varios espacios', () => {
    const r = parseCoachReply(
      { reply: 'Sobra.', proposalSummary: 'x', changes: [{ kind: 'remove', title: '3  - Sacar la licencia de conducción' }] },
      stages,
    )
    expect(changesOf(r)).toEqual([{ kind: 'remove', title: 'Sacar la licencia de conducción' }])
  })

  it('ignora la numeración que el modelo copia del prompt', () => {
    const r = parseCoachReply(
      { reply: 'Sobra.', proposalSummary: 'x', changes: [{ kind: 'remove', title: '3. Sacar la licencia de conducción' }] },
      stages,
    )
    expect(changesOf(r)).toEqual([{ kind: 'remove', title: 'Sacar la licencia de conducción' }])
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
    expect(changesOf(r)).toEqual([
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
    expect(changesOf(parseCoachReply({ reply: 'x', proposalSummary: '', changes }, stages))).toHaveLength(4)
  })
})

describe('parseCoachReply: avance', () => {
  const base = { reply: '¡Bien hecho!', proposalSummary: '', changes: [] }
  it('arma la propuesta de avance cuando se permite registrar', () => {
    const r = parseCoachReply({ ...base, progress: '  Revisé mis gastos de la semana: 320.000 ' }, stages, true)
    expect(r?.proposal).toEqual({ kind: 'progress', note: 'Revisé mis gastos de la semana: 320.000' })
  })
  it('recorta la nota al máximo', () => {
    const r = parseCoachReply({ ...base, progress: 'x'.repeat(400) }, stages, true)
    expect(r?.proposal?.kind === 'progress' && r.proposal.note).toHaveLength(PROGRESS_NOTE_MAX)
  })
  it('nota vacía o que no es texto → sin propuesta', () => {
    expect(parseCoachReply({ ...base, progress: '   ' }, stages, true)?.proposal).toBeNull()
    expect(parseCoachReply({ ...base, progress: { html: '<b>x</b>' } }, stages, true)?.proposal).toBeNull()
  })
  it('sin permiso para registrar (asistente) se descarta la nota', () => {
    expect(parseCoachReply({ ...base, progress: 'Hice algo' }, stages)?.proposal).toBeNull()
  })
  it('con cambios y nota a la vez, solo quedan los cambios', () => {
    const r = parseCoachReply(
      {
        reply: 'Ya tenías la licencia.',
        proposalSummary: 'Quitar la licencia.',
        changes: [{ kind: 'remove', title: 'Sacar la licencia de conducción' }],
        progress: 'Saqué la licencia',
      },
      stages,
      true,
    )
    expect(r?.proposal?.kind).toBe('stages')
  })
})

describe('readStoredProposal', () => {
  it('lee filas viejas sin kind como propuesta de etapas', () => {
    const old = { summary: 'Quitar la licencia.', changes: [{ kind: 'remove', title: 'X' }], status: 'applied' }
    expect(readStoredProposal(old)).toEqual({ kind: 'stages', ...old })
  })
  it('valida y recorta la nota de avance guardada', () => {
    expect(readStoredProposal({ kind: 'progress', note: 'y'.repeat(300) })).toEqual({
      kind: 'progress',
      note: 'y'.repeat(PROGRESS_NOTE_MAX),
      status: 'pending',
    })
    expect(readStoredProposal({ kind: 'progress', note: 42, status: 'pending' })).toBeNull()
    expect(readStoredProposal(null)).toBeNull()
    expect(readStoredProposal({ summary: 'sin cambios' })).toBeNull()
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
  it('trae las reglas de conversación y la etapa actual', () => {
    const p = buildChatPrompt({ ...ctx, canLogProgress: true }, [], 'hola')
    expect(p).toContain('<etapa_actual>2. Ahorrar la cuota inicial</etapa_actual>')
    expect(p).toContain('Nunca repitas tu respuesta anterior')
    expect(p).toContain('Nunca anuncies un paso sin decirlo')
    expect(p).toContain('Marcar esta etapa como cumplida')
    expect(p).toContain('propón registrarlo como avance en "progress"')
    expect(p).not.toContain('vos ')
  })
  it('sabe qué día es y cuántas semanas quedan', () => {
    const p = buildChatPrompt({ ...ctx, targetDate: '2027-03-01' }, [], 'hola', [], new Date('2026-11-06T15:00:00Z'))
    expect(p).toContain('<hoy>2026-11-06</hoy>')
    expect(p).toContain('<semanas_disponibles>16</semanas_disponibles>')
  })
  it('ante una meta que no alcanza, pide cuentas y opciones concretas', () => {
    const p = buildChatPrompt(ctx, [], 'no creo llegar')
    expect(p).toContain('no llega a la meta')
    expect(p).toContain('Editar')
  })
  it('sin canLogProgress no propone avances', () => {
    const p = buildChatPrompt(ctx, [], 'ya lo hice')
    expect(p).toContain('progress: siempre vacío')
    expect(p).not.toContain('propón registrarlo como avance')
  })
  it('etapa actual cuando todas están cumplidas o no hay etapas', () => {
    expect(buildChatPrompt({ ...ctx, stages: [{ title: 'A', done: true }] }, [], 'x')).toContain(
      '<etapa_actual>(todas cumplidas)</etapa_actual>',
    )
    expect(buildChatPrompt({ ...ctx, stages: [] }, [], 'x')).not.toContain('</etapa_actual>')
  })
  it('conversación del problema: tras la instrucción y un "sí", el prompt pide no repetir y muestra lo ya dicho', () => {
    const budget: ChatContext = {
      title: 'Armar mi presupuesto mensual',
      area: 'finanzas',
      canLogProgress: true,
      stages: [
        { title: 'Registrar mis gastos de un mes' },
        { title: 'Definir categorías' },
        { title: 'Fijar topes por categoría' },
        { title: 'Revisar cada semana' },
      ],
    }
    const instruction = 'Anota todos tus gastos de esta semana en una lista y suma el total.'
    const history = [
      { role: 'user' as const, text: '¿Qué hago hoy?' },
      { role: 'coach' as const, text: instruction },
      { role: 'user' as const, text: '¿Te basas en el primer paso?' },
      { role: 'coach' as const, text: instruction },
    ]
    const p = buildChatPrompt(budget, history, 'sí')
    expect(p).toContain(`<coach>${instruction}</coach></conversacion>`)
    expect(p).toContain('<etapa_actual>1. Registrar mis gastos de un mes</etapa_actual>')
    expect(p).toContain('Nunca repitas tu respuesta anterior')
    expect(p).toContain('Si la persona confirma ("sí"')
    expect(p).toContain('cuéntame el total')
    expect(p).toContain('<mensaje_nuevo>sí</mensaje_nuevo>')
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
