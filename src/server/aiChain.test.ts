import { describe, expect, it, vi } from 'vitest'
import { createModelChain, parseChain, toJsonSchema, type ChainLink, type ChainOptions } from './aiChain'
import { PlannerError } from './plannerError'

const gemini = (model: string, apiKey = 'g1'): ChainLink => ({ provider: 'gemini', model, apiKey, label: `gemini:${model}` })
const groq: ChainLink = { provider: 'groq', model: 'openai/gpt-oss-120b', apiKey: 'q1', label: 'groq:openai/gpt-oss-120b' }

const REQ = { system: 'sys', prompt: 'hola', schema: { type: 'OBJECT', properties: { a: { type: 'STRING' } } } }
const parseA = (raw: unknown) =>
  raw && typeof raw === 'object' && typeof (raw as { a?: unknown }).a === 'string' ? (raw as { a: string }).a : null

function geminiOk(text: string, finishReason = 'STOP') {
  return new Response(JSON.stringify({ candidates: [{ finishReason, content: { parts: [{ text }] } }] }), { status: 200 })
}
function openaiOk(text: string, finish_reason = 'stop') {
  return new Response(JSON.stringify({ choices: [{ finish_reason, message: { content: text } }] }), { status: 200 })
}
const status = (code: number) => new Response('{}', { status: code })

/** Reloj falso: `sleep` avanza el tiempo sin esperar de verdad. */
function harness(responses: (Response | Error)[], over: Partial<ChainOptions> = {}) {
  let clock = 0
  const fetchMock = vi.fn(async (url: string, init: RequestInit) => {
    void url
    void init
    const next = responses.shift()
    if (!next) throw new Error('sin respuesta preparada')
    if (next instanceof Error) throw next
    return next
  })
  const log = vi.fn()
  const opts: ChainOptions = {
    fetch: fetchMock as unknown as typeof fetch,
    now: () => clock,
    sleep: async (ms) => {
      clock += ms
    },
    random: () => 0.5,
    log,
    ...over,
  }
  return { fetchMock, log, opts, advance: (ms: number) => (clock += ms) }
}

const bodyOf = (call: unknown[]) => JSON.parse((call[1] as RequestInit).body as string)

describe('parseChain', () => {
  it('usa la cadena por defecto y descarta proveedores sin clave', () => {
    const links = parseChain({ GEMINI_API_KEY: 'g1' })
    expect(links.length).toBeGreaterThan(1)
    expect(links.every((l) => l.provider === 'gemini' && l.apiKey === 'g1')).toBe(true)
  })

  it('respeta AI_CHAIN, expande varias claves de Gemini y pone GEMINI_MODEL primero', () => {
    const links = parseChain({
      AI_CHAIN: 'gemini:gemini-3.6-flash, groq:openai/gpt-oss-120b, openrouter:openrouter/free, raro:x, gemini:',
      GEMINI_API_KEY: 'g1, g2',
      GEMINI_MODEL: 'gemini-3.5-flash-lite',
      GROQ_API_KEY: 'q1',
    })
    expect(links.map((l) => `${l.label} ${l.apiKey}`)).toEqual([
      'gemini:gemini-3.5-flash-lite g1',
      'gemini:gemini-3.5-flash-lite#2 g2',
      'gemini:gemini-3.6-flash g1',
      'gemini:gemini-3.6-flash#2 g2',
      'groq:openai/gpt-oss-120b q1',
    ])
  })

  it('no duplica GEMINI_MODEL si ya está en la cadena', () => {
    const links = parseChain({ AI_CHAIN: 'gemini:a,gemini:b', GEMINI_MODEL: 'b', GEMINI_API_KEY: 'g' })
    expect(links.map((l) => l.model)).toEqual(['b', 'a'])
  })

  it('normaliza espacios alrededor de ":" antes de quitar repetidos', () => {
    const links = parseChain({ AI_CHAIN: 'gemini: a , gemini:a,gemini:b', GEMINI_MODEL: 'a', GEMINI_API_KEY: 'g' })
    expect(links.map((l) => l.label)).toEqual(['gemini:a', 'gemini:b'])
  })

  it('sin ninguna clave devuelve una cadena vacía', () => {
    expect(parseChain({})).toEqual([])
  })
})

describe('toJsonSchema', () => {
  it('pasa los tipos de Gemini a JSON Schema y conserva el resto', () => {
    expect(
      toJsonSchema({
        type: 'OBJECT',
        properties: { k: { type: 'STRING', enum: ['a'] }, n: { type: 'ARRAY', items: { type: 'INTEGER' } } },
        required: ['k'],
      }),
    ).toEqual({
      type: 'object',
      properties: { k: { type: 'string', enum: ['a'] }, n: { type: 'array', items: { type: 'integer' } } },
      required: ['k'],
    })
  })
})

describe('createModelChain', () => {
  it('devuelve la primera respuesta válida con el formato de Gemini', async () => {
    const h = harness([geminiOk('{"a":"x"}')])
    expect(await createModelChain([gemini('m1')], h.opts).run(REQ, parseA)).toBe('x')
    const [url, init] = h.fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('https://generativelanguage.googleapis.com/v1beta/models/m1:generateContent')
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('g1')
    const body = bodyOf(h.fetchMock.mock.calls[0])
    expect(body.systemInstruction.parts[0].text).toBe('sys')
    expect(body.generationConfig.responseSchema).toEqual(REQ.schema)
  })

  it('ante 503 salta al siguiente modelo y luego a otro proveedor', async () => {
    const h = harness([status(503), status(503), openaiOk('{"a":"de groq"}')])
    const chain = createModelChain([gemini('m1'), gemini('m2'), groq], h.opts)
    expect(await chain.run(REQ, parseA)).toBe('de groq')
    const [url, init] = h.fetchMock.mock.calls[2] as [string, RequestInit]
    expect(url).toBe('https://api.groq.com/openai/v1/chat/completions')
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer q1')
    const body = bodyOf(h.fetchMock.mock.calls[2])
    expect(body.model).toBe('openai/gpt-oss-120b')
    expect(body.messages).toEqual([
      { role: 'system', content: 'sys' },
      { role: 'user', content: 'hola' },
    ])
    expect(body.response_format.json_schema.schema).toEqual({ type: 'object', properties: { a: { type: 'string' } } })
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('gemini:m1 http_503'))
  })

  it('salta ante 429, error de red, respuesta cortada, JSON inválido y 400', async () => {
    const h = harness([
      status(429),
      new TypeError('fetch failed'),
      geminiOk('{"a":"x"}', 'MAX_TOKENS'),
      geminiOk('no es json'),
      status(400),
      geminiOk('{"a":"por fin"}'),
    ])
    const links = ['a', 'b', 'c', 'd', 'e', 'f'].map((m) => gemini(m))
    expect(await createModelChain(links, h.opts).run(REQ, parseA)).toBe('por fin')
    expect(h.fetchMock).toHaveBeenCalledTimes(6)
  })

  it('pone en enfriamiento el eslabón que dio 503 y lo salta en la siguiente llamada', async () => {
    const h = harness([status(503), geminiOk('{"a":"1"}'), geminiOk('{"a":"2"}')])
    const chain = createModelChain([gemini('m1'), gemini('m2')], h.opts)
    await chain.run(REQ, parseA)
    expect(await chain.run(REQ, parseA)).toBe('2')
    expect(h.fetchMock.mock.calls[2][0]).toContain('/m2:')
  })

  it('el enfriamiento vence a los 60 s', async () => {
    const h = harness([status(503), geminiOk('{"a":"1"}'), geminiOk('{"a":"2"}')])
    const chain = createModelChain([gemini('m1'), gemini('m2')], h.opts)
    await chain.run(REQ, parseA)
    h.advance(60_001)
    await chain.run(REQ, parseA)
    expect(h.fetchMock.mock.calls[2][0]).toContain('/m1:')
  })

  it('si todos están enfriados los prueba igual', async () => {
    const h = harness([status(503), status(503), geminiOk('{"a":"ok"}')])
    const chain = createModelChain([gemini('m1')], h.opts)
    await expect(chain.run(REQ, parseA)).rejects.toThrow(PlannerError)
    expect(await chain.run(REQ, parseA)).toBe('ok')
  })

  it('tras fallar la pasada completa reintenta el primero una vez con espera', async () => {
    const sleep = vi.fn(async (ms: number) => void ms)
    const h = harness([status(503), status(503), geminiOk('{"a":"reintento"}')], { sleep })
    const chain = createModelChain([gemini('m1'), groq], h.opts)
    expect(await chain.run(REQ, parseA)).toBe('reintento')
    expect(h.fetchMock.mock.calls[2][0]).toContain('/m1:')
    // 1 s con jitter de ±25 %: con random=0.5 queda en 1 s exacto.
    expect(sleep).toHaveBeenCalledWith(1000)
  })

  it('no reintenta si todos los fallos son de configuración y lanza PlannerError', async () => {
    const h = harness([status(401), status(404)])
    const chain = createModelChain([gemini('m1'), groq], h.opts)
    await expect(chain.run(REQ, parseA)).rejects.toThrow(PlannerError)
    expect(h.fetchMock).toHaveBeenCalledTimes(2)
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('config'))
  })

  it('respeta el presupuesto total: no empieza intentos sin tiempo', async () => {
    const h = harness([])
    const slow = vi.fn(async () => {
      h.advance(46_000)
      return status(503)
    })
    const chain = createModelChain([gemini('m1'), gemini('m2')], { ...h.opts, fetch: slow as unknown as typeof fetch })
    await expect(chain.run(REQ, parseA)).rejects.toThrow(PlannerError)
    expect(slow).toHaveBeenCalledTimes(1)
  })

  it('pasa un timeout por intento al fetch', async () => {
    const h = harness([geminiOk('{"a":"x"}')])
    await createModelChain([gemini('m1')], h.opts).run(REQ, parseA)
    expect((h.fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBeInstanceOf(AbortSignal)
  })

  it('OpenRouter exige proveedores que respeten el formato', async () => {
    const h = harness([openaiOk('{"a":"x"}')])
    const link: ChainLink = { provider: 'openrouter', model: 'openrouter/free', apiKey: 'o1', label: 'openrouter:openrouter/free' }
    await createModelChain([link], h.opts).run(REQ, parseA)
    expect(h.fetchMock.mock.calls[0][0]).toBe('https://openrouter.ai/api/v1/chat/completions')
    expect(bodyOf(h.fetchMock.mock.calls[0]).provider).toEqual({ require_parameters: true })
  })

  it('el reintento final salta el eslabón que falló por configuración', async () => {
    const h = harness([status(404), status(503), geminiOk('{"a":"rescate"}')])
    const chain = createModelChain([gemini('mal'), gemini('m2')], h.opts)
    expect(await chain.run(REQ, parseA)).toBe('rescate')
    expect(h.fetchMock.mock.calls[2][0]).toContain('/m2:')
  })

  it('un eslabón mal configurado se enfría 10 min; un 400 no lo enfría', async () => {
    const h = harness([status(401), status(400), geminiOk('{"a":"1"}'), geminiOk('{"a":"2"}')])
    const chain = createModelChain([gemini('clave-mala'), gemini('pedido-raro'), gemini('m3')], h.opts)
    await chain.run(REQ, parseA)
    h.advance(5 * 60_000)
    // Orden nuevo: los frescos (pedido-raro, m3) primero; clave-mala va al final.
    h.fetchMock.mockClear()
    await chain.run(REQ, parseA)
    expect(h.fetchMock.mock.calls[0][0]).toContain('/pedido-raro:')
  })

  it('si el cuerpo se corta por timeout cuenta como transitorio y enfría', async () => {
    const timeout = Object.assign(new Error('aborted'), { name: 'TimeoutError' })
    const slowBody = { ok: true, status: 200, json: async () => Promise.reject(timeout) } as unknown as Response
    const h = harness([slowBody, geminiOk('{"a":"1"}'), geminiOk('{"a":"2"}')])
    const chain = createModelChain([gemini('lento'), gemini('m2')], h.opts)
    await chain.run(REQ, parseA)
    expect(h.log).toHaveBeenCalledWith(expect.stringContaining('gemini:lento timeout'))
    await chain.run(REQ, parseA)
    expect(h.fetchMock.mock.calls[2][0]).toContain('/m2:')
  })

  it('prueba los eslabones enfriados al final si los frescos fallan', async () => {
    const h = harness([status(503), geminiOk('{"a":"1"}'), status(429), geminiOk('{"a":"recuperado"}')])
    const chain = createModelChain([gemini('m1'), gemini('m2')], h.opts)
    await chain.run(REQ, parseA)
    // m1 está enfriado; m2 falla; m1 se intenta igual al final de la pasada.
    expect(await chain.run(REQ, parseA)).toBe('recuperado')
    expect(h.fetchMock.mock.calls[3][0]).toContain('/m1:')
  })

  it('da margen de tokens al razonamiento en proveedores compatibles con OpenAI', async () => {
    const h = harness([openaiOk('{"a":"x"}')])
    await createModelChain([groq], h.opts).run({ ...REQ, maxOutputTokens: 4096 }, parseA)
    const body = bodyOf(h.fetchMock.mock.calls[0])
    expect(body.max_completion_tokens).toBe(4096 + 1024)
    expect(body.reasoning_effort).toBe('low')
  })

  it('una cadena vacía falla con PlannerError', async () => {
    await expect(createModelChain([], harness([]).opts).run(REQ, parseA)).rejects.toThrow(PlannerError)
  })
})
