/**
 * Cadena de respaldo de modelos: recorre eslabones `proveedor:modelo` hasta que
 * uno devuelva un JSON que pase el parseo del dominio. Corre SOLO en el
 * servidor. Ver docs/superpowers/specs/2026-11-05-cadena-respaldo-ia-design.md.
 */
import { PlannerError } from './goalPlanner.js'

export type ProviderId = 'gemini' | 'groq' | 'openrouter'

export interface ChainLink {
  provider: ProviderId
  model: string
  apiKey: string
  /** Identifica el eslabón en logs y enfriamiento (no incluye la clave). */
  label: string
}

export interface ModelRequest {
  system: string
  prompt: string
  /** Esquema en el formato de Gemini (tipos en mayúsculas). */
  schema: object
  maxOutputTokens?: number
  /** Presupuesto propio de esta llamada (p. ej. más corto para algo opcional). */
  budgetMs?: number
}

export interface ChainOptions {
  fetch: typeof fetch
  now: () => number
  sleep: (ms: number) => Promise<void>
  random: () => number
  log: (line: string) => void
  /** Tiempo total por llamada al modelo, sumando todos los intentos. */
  budgetMs?: number
  attemptMs?: number
  cooldownMs?: number
}

export interface ModelChain {
  run<T>(req: ModelRequest, parse: (raw: unknown) => T | null): Promise<T>
}

/**
 * Orden por defecto en la fase de pruebas (capas gratuitas). Varios modelos de
 * Gemini porque la sobrecarga (503) suele ser por modelo; luego otras empresas.
 */
export const DEFAULT_CHAIN = [
  'gemini:gemini-3.5-flash-lite',
  'gemini:gemini-3.6-flash',
  'gemini:gemini-3.1-flash-lite',
  'groq:openai/gpt-oss-120b',
  'openrouter:openrouter/free',
]

const KEY_ENV: Record<ProviderId, string> = {
  gemini: 'GEMINI_API_KEY',
  groq: 'GROQ_API_KEY',
  openrouter: 'OPENROUTER_API_KEY',
}

const isProvider = (p: string): p is ProviderId => Object.hasOwn(KEY_ENV, p)

const splitList = (value: string | undefined) =>
  (value ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)

/**
 * Arma los eslabones desde el entorno: AI_CHAIN (o la cadena por defecto), con
 * GEMINI_MODEL primero si está. Cada clave de GEMINI_API_KEY (separadas por
 * comas) da un eslabón: la cuota de Gemini es por proyecto, no por clave.
 */
export function parseChain(env: Record<string, string | undefined>): ChainLink[] {
  const specs = env.AI_CHAIN?.trim() ? splitList(env.AI_CHAIN) : [...DEFAULT_CHAIN]
  const preferred = env.GEMINI_MODEL?.trim()
  if (preferred) {
    const spec = `gemini:${preferred}`
    specs.splice(0, specs.length, spec, ...specs.filter((s) => s !== spec))
  }
  const links: ChainLink[] = []
  for (const spec of specs) {
    const sep = spec.indexOf(':')
    const provider = spec.slice(0, sep).trim()
    const model = spec.slice(sep + 1).trim()
    if (sep < 1 || !model || !isProvider(provider)) continue
    splitList(env[KEY_ENV[provider]]).forEach((apiKey, i) => {
      const label = `${provider}:${model}${i > 0 ? `#${i + 1}` : ''}`
      links.push({ provider, model, apiKey, label })
    })
  }
  return links
}

/** Esquema de Gemini (OBJECT, STRING…) → JSON Schema (object, string…). */
export function toJsonSchema(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(toJsonSchema)
  if (!schema || typeof schema !== 'object') return schema
  return Object.fromEntries(
    Object.entries(schema).map(([k, v]) => {
      if (k === 'type' && typeof v === 'string') return [k, v.toLowerCase()]
      if (k === 'enum' || k === 'required') return [k, v]
      return [k, toJsonSchema(v)]
    }),
  )
}

type Failure = 'transient' | 'invalid' | 'config'
type Attempt<T> = { ok: true; value: T } | { ok: false; kind: Failure; reason: string }

interface HttpCall {
  url: string
  headers: Record<string, string>
  body: unknown
  /** Texto de la respuesta si terminó normalmente; null si vino cortada o vacía. */
  read(data: unknown): string | null
}

const OPENAI_BASE: Record<Exclude<ProviderId, 'gemini'>, string> = {
  groq: 'https://api.groq.com/openai/v1',
  openrouter: 'https://openrouter.ai/api/v1',
}

function buildCall(link: ChainLink, req: ModelRequest): HttpCall {
  const maxTokens = req.maxOutputTokens ?? 4096
  if (link.provider === 'gemini') {
    return {
      url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(link.model)}:generateContent`,
      headers: { 'x-goog-api-key': link.apiKey },
      body: {
        // Instrucción de sistema fija: prefijo estable para el caché implícito
        // del proveedor y separada de los datos de la persona.
        systemInstruction: { parts: [{ text: req.system }] },
        contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
        generationConfig: {
          responseMimeType: 'application/json',
          responseSchema: req.schema,
          // Razonamiento bajo: es lo que más pesa en la latencia.
          thinkingConfig: { thinkingLevel: 'low' },
          maxOutputTokens: maxTokens,
        },
      },
      read(data) {
        const c = (data as { candidates?: { finishReason?: string; content?: { parts?: { text?: string }[] } }[] })
          .candidates?.[0]
        // Un JSON cortado por límite de tokens puede seguir siendo "válido": solo STOP cuenta.
        if (c?.finishReason !== 'STOP') return null
        return c.content?.parts?.map((p) => p.text ?? '').join('') ?? null
      },
    }
  }
  const body: Record<string, unknown> = {
    model: link.model,
    messages: [
      { role: 'system', content: req.system },
      { role: 'user', content: req.prompt },
    ],
    // strict:false porque los esquemas tienen campos opcionales; el parseo del
    // dominio valida igual y una salida fuera de esquema salta al siguiente.
    response_format: { type: 'json_schema', json_schema: { name: 'respuesta', strict: false, schema: toJsonSchema(req.schema) } },
  }
  if (link.provider === 'groq') {
    body.max_completion_tokens = maxTokens
    if (link.model.includes('gpt-oss')) body.reasoning_effort = 'low'
  } else {
    body.max_tokens = maxTokens
    // Solo proveedores de OpenRouter que respeten response_format.
    body.provider = { require_parameters: true }
  }
  return {
    url: `${OPENAI_BASE[link.provider]}/chat/completions`,
    headers: { Authorization: `Bearer ${link.apiKey}` },
    body,
    read(data) {
      const c = (data as { choices?: { finish_reason?: string; message?: { content?: string | null } }[] }).choices?.[0]
      if (c?.finish_reason !== 'stop') return null
      return c.message?.content ?? null
    },
  }
}

function classifyStatus(status: number): Failure {
  return status === 408 || status === 429 || status >= 500 ? 'transient' : 'config'
}

export function createModelChain(links: ChainLink[], opts: ChainOptions): ModelChain {
  const budgetMs = opts.budgetMs ?? 45_000
  const attemptMs = opts.attemptMs ?? 20_000
  const cooldownMs = opts.cooldownMs ?? 60_000
  const coolUntil = new Map<string, number>()

  async function attempt<T>(
    link: ChainLink,
    req: ModelRequest,
    parse: (raw: unknown) => T | null,
    timeoutMs: number,
  ): Promise<Attempt<T>> {
    const call = buildCall(link, req)
    let res: Response
    try {
      res = await opts.fetch(call.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...call.headers },
        signal: AbortSignal.timeout(timeoutMs),
        body: JSON.stringify(call.body),
      })
    } catch (err) {
      const timeout = err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')
      return { ok: false, kind: 'transient', reason: timeout ? 'timeout' : 'network' }
    }
    if (!res.ok) return { ok: false, kind: classifyStatus(res.status), reason: `http_${res.status}` }
    try {
      const text = call.read(await res.json())
      if (text === null) return { ok: false, kind: 'invalid', reason: 'truncated' }
      const value = parse(JSON.parse(text))
      return value === null ? { ok: false, kind: 'invalid', reason: 'off_schema' } : { ok: true, value }
    } catch {
      return { ok: false, kind: 'invalid', reason: 'bad_json' }
    }
  }

  return {
    async run(req, parse) {
      const start = opts.now()
      const budget = req.budgetMs ?? budgetMs
      const remaining = () => budget - (opts.now() - start)
      const fresh = links.filter((l) => (coolUntil.get(l.label) ?? 0) <= opts.now())
      const order = fresh.length > 0 ? fresh : links
      const kinds: Failure[] = []
      let failures = 0

      const tryLink = async (link: ChainLink) => {
        const t0 = opts.now()
        const result = await attempt(link, req, parse, Math.min(attemptMs, remaining()))
        if (result.ok) {
          if (failures > 0) opts.log(`[ai] ok ${link.label} tras ${failures} fallo(s)`)
          return result
        }
        failures++
        kinds.push(result.kind)
        if (result.kind === 'transient') coolUntil.set(link.label, opts.now() + cooldownMs)
        const tag = result.kind === 'config' ? ' (config)' : ''
        opts.log(`[ai] ${link.label} ${result.reason}${tag} ${opts.now() - t0}ms`)
        return result
      }

      for (const link of order) {
        if (remaining() <= 0) break
        const result = await tryLink(link)
        if (result.ok) return result.value
      }
      // Pasada completa sin éxito: un último intento con el mejor eslabón, tras
      // una espera corta con jitter (lo que recomienda Google ante 503/429).
      // No tiene sentido si todo falló por configuración (clave o modelo mal).
      if (order.length > 0 && kinds.some((k) => k !== 'config')) {
        const wait = Math.round(1000 * (0.75 + opts.random() * 0.5))
        if (remaining() > wait) {
          await opts.sleep(wait)
          if (remaining() > 0) {
            const result = await tryLink(order[0])
            if (result.ok) return result.value
          }
        }
      }
      throw new PlannerError(order.length === 0 ? 'No hay modelos configurados' : 'Ningún modelo respondió')
    },
  }
}

/** Opciones reales (red, reloj y consola) para producción y desarrollo. */
export const realChainOptions = (): ChainOptions => ({
  fetch: (...args) => fetch(...args),
  now: () => Date.now(),
  sleep: (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
  random: Math.random,
  log: (line) => console.warn(line),
})
