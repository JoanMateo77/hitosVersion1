/**
 * Backend falso para las capturas: intercepta en el navegador TODO lo que iría
 * a Supabase (mock.supabase.test) y a /api/plan-meta, y aborta cualquier otra
 * petición que no sea a localhost. Nada sale a la red real.
 *
 * El mock de PostgREST es genérico: tabla por ruta, filtros simples del query
 * string (eq/neq/in/is/gt/gte/lt/lte, con `not.`), order, limit, objeto único
 * (Accept: application/vnd.pgrst.object+json) y escrituras que devuelven la fila.
 */
import { randomUUID } from 'node:crypto'
import type { Page, Route } from '@playwright/test'
import { aiResponse } from './fixtures/ai'
import type { Row, Tables } from './fixtures/data'
import { MOCK_SUPABASE_URL, mockSession, mockUser } from './fixtures/session'

/** Las respuestas cruzan de origen (localhost → mock.supabase.test): CORS abierto. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'content-range',
}

const RESERVED = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
/** Tablas cuya PK no es `id` (no se les inventa uno al insertar). */
const NO_ID = new Set(['habit_checks', 'habit_skips', 'habit_day_overrides', 'lesson_reads'])
const DEFAULTS: Record<string, Row> = {
  sessions: {
    status: 'pending',
    started_at: null,
    ended_at: null,
    actual_value: null,
    paused_at: null,
    paused_total_seconds: 0,
    accomplishment: null,
  },
  goals: { status: 'active', last_reviewed_at: null, completed_at: null, ai_plan: null, ai_answers: [] },
  milestones: { done_at: null, target_date: null },
  tasks: { status: 'pending', done_at: null, source: 'user' },
  notes: { pinned: false, archived_at: null, items: null, title: null },
  events: { done_at: null, notes: null },
  habits: { archived_at: null, paused_until: null, times_per_day: 1 },
  habit_checks: { slot: 0 },
}

export interface PageLog {
  consoleErrors: string[]
  pageErrors: string[]
  failedRequests: string[]
  httpErrors: string[]
  blocked: string[]
}

export function newLog(): PageLog {
  return { consoleErrors: [], pageErrors: [], failedRequests: [], httpErrors: [], blocked: [] }
}

function isLocal(url: URL): boolean {
  return ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
}

function isFontHost(url: URL): boolean {
  return url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com'
}

/* ===== Filtros PostgREST ================================================== */

function compare(a: unknown, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (typeof a === 'number' || (a !== '' && a !== null && !Number.isNaN(na) && !Number.isNaN(nb) && /^-?\d+(\.\d+)?$/.test(b))) {
    return na - nb
  }
  return String(a).localeCompare(b)
}

function unquote(v: string): string {
  return v.startsWith('"') && v.endsWith('"') ? v.slice(1, -1) : v
}

function matches(row: Row, column: string, expr: string): boolean {
  let negate = false
  let rest = expr
  if (rest.startsWith('not.')) {
    negate = true
    rest = rest.slice(4)
  }
  const dot = rest.indexOf('.')
  const op = rest.slice(0, dot)
  const raw = rest.slice(dot + 1)
  const value = row[column]
  let ok: boolean
  switch (op) {
    case 'eq':
      ok = value != null && String(value) === unquote(raw)
      break
    case 'neq':
      ok = value == null || String(value) !== unquote(raw)
      break
    case 'is':
      ok = raw === 'null' ? value == null : String(value) === raw
      break
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map(unquote)
      ok = value != null && list.includes(String(value))
      break
    }
    case 'gt':
      ok = value != null && compare(value, raw) > 0
      break
    case 'gte':
      ok = value != null && compare(value, raw) >= 0
      break
    case 'lt':
      ok = value != null && compare(value, raw) < 0
      break
    case 'lte':
      ok = value != null && compare(value, raw) <= 0
      break
    default:
      ok = true // operador no soportado: no filtra
  }
  return negate ? !ok : ok
}

function applyFilters(rows: Row[], params: URLSearchParams): Row[] {
  let out = rows
  for (const [key, expr] of params) {
    if (RESERVED.has(key) || key.includes('.')) continue
    out = out.filter((r) => matches(r, key, expr))
  }
  return out
}

function applyOrder(rows: Row[], order: string | null): Row[] {
  if (!order) return rows
  const keys = order.split(',').map((part) => {
    const [col, ...mods] = part.split('.')
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') }
  })
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const va = a[k.col]
      const vb = b[k.col]
      if (va == null && vb == null) continue
      if (va == null) return k.nullsFirst ? -1 : 1
      if (vb == null) return k.nullsFirst ? 1 : -1
      const c = compare(va, String(vb))
      if (c !== 0) return k.desc ? -c : c
    }
    return 0
  })
}

/* ===== PostgREST ========================================================== */

class Store {
  constructor(private tables: Tables) {}

  rows(table: string): Row[] {
    if (!this.tables[table]) this.tables[table] = []
    return this.tables[table]
  }

  /** `goal_schedule?select=*,goals!inner(status)&goals.status=eq.active` */
  withEmbeds(table: string, rows: Row[], params: URLSearchParams): Row[] {
    const select = params.get('select') ?? ''
    if (table === 'goal_schedule' && select.includes('goals')) {
      const goals = this.rows('goals')
      let out = rows.map((r) => ({ ...r, goals: { status: goals.find((g) => g.id === r.goal_id)?.status ?? null } }))
      const statusFilter = params.get('goals.status')
      if (statusFilter) out = out.filter((r) => matches(r.goals as Row, 'status', statusFilter))
      return out
    }
    return rows
  }

  async handle(route: Route, table: string, url: URL): Promise<void> {
    const req = route.request()
    const method = req.method()
    const headers = await req.allHeaders()
    const accept = headers['accept'] ?? ''
    const prefer = headers['prefer'] ?? ''
    const single = accept.includes('vnd.pgrst.object')
    const params = url.searchParams
    const all = this.rows(table)

    let result: Row[] = []
    let status = 200

    if (method === 'GET' || method === 'HEAD') {
      result = applyOrder(this.withEmbeds(table, applyFilters(all, params), params), params.get('order'))
      const limit = Number(params.get('limit'))
      if (limit > 0) result = result.slice(0, limit)
    } else if (method === 'POST') {
      const body = req.postDataJSON() as Row | Row[]
      const incoming = Array.isArray(body) ? body : [body]
      const conflict = params.get('on_conflict')?.split(',')
      const ignoreDup = prefer.includes('resolution=ignore-duplicates')
      const merge = prefer.includes('resolution=merge-duplicates')
      for (const item of incoming) {
        const existing = conflict ? all.find((r) => conflict.every((c) => String(r[c]) === String(item[c]))) : undefined
        if (existing) {
          if (merge) {
            Object.assign(existing, item)
            result.push(existing)
          } else if (!ignoreDup) {
            result.push(existing)
          }
          continue
        }
        if (table === 'habit_checks' && all.some((r) => r.habit_id === item.habit_id && r.date === item.date && (r.slot ?? 0) === (item.slot ?? 0))) {
          return route.fulfill({
            status: 409,
            headers: CORS,
            contentType: 'application/json',
            body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }),
          })
        }
        const row: Row = {
          ...(DEFAULTS[table] ?? {}),
          ...(NO_ID.has(table) ? {} : { id: randomUUID() }),
          created_at: new Date().toISOString(),
          ...(table === 'notes' ? { updated_at: new Date().toISOString() } : {}),
          ...item,
        }
        all.push(row)
        result.push(row)
      }
      status = 201
    } else if (method === 'PATCH') {
      const patch = req.postDataJSON() as Row
      result = applyFilters(all, params)
      for (const r of result) Object.assign(r, patch)
    } else if (method === 'DELETE') {
      result = applyFilters(all, params)
      this.tables[table] = all.filter((r) => !result.includes(r))
    }

    const contentRange = result.length ? `0-${result.length - 1}/${result.length}` : `*/0`
    const respHeaders = { ...CORS, 'content-range': contentRange }

    if (method === 'HEAD') {
      return route.fulfill({ status: 200, headers: respHeaders, body: '' })
    }
    if (method !== 'GET' && !prefer.includes('return=representation')) {
      return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: respHeaders, body: '' })
    }
    if (single) {
      if (result.length !== 1) {
        return route.fulfill({
          status: 406,
          contentType: 'application/json',
          headers: respHeaders,
          body: JSON.stringify({
            code: 'PGRST116',
            message: 'JSON object requested, multiple (or no) rows returned',
            details: `The result contains ${result.length} rows`,
            hint: null,
          }),
        })
      }
      return route.fulfill({ status, contentType: 'application/vnd.pgrst.object+json', headers: respHeaders, body: JSON.stringify(result[0]) })
    }
    return route.fulfill({ status, contentType: 'application/json', headers: respHeaders, body: JSON.stringify(result) })
  }
}

/* ===== Montaje en la página =============================================== */

const json = (route: Route, body: unknown, status = 200) =>
  route.fulfill({ status, headers: CORS, contentType: 'application/json', body: JSON.stringify(body) })

/**
 * Instala las intercepciones. El orden importa: Playwright prueba primero el
 * último handler registrado, así que el "abortar todo lo externo" va primero.
 */
export async function installMocks(page: Page, tables: Tables, log: PageLog, opts: { allowFonts?: boolean } = {}) {
  const store = new Store(tables)

  // 1) Red de seguridad: nada externo salvo localhost (y fuentes si se pidió).
  await page.route('**/*', (route) => {
    const url = new URL(route.request().url())
    if (url.protocol === 'data:' || url.protocol === 'blob:' || isLocal(url)) return route.fallback()
    if (opts.allowFonts && isFontHost(url) && route.request().method() === 'GET') return route.fallback()
    log.blocked.push(`${route.request().method()} ${url.origin}${url.pathname}`)
    return route.abort('blockedbyclient')
  })

  // 2) Coach de IA local.
  await page.route('**/api/plan-meta', (route) => {
    let action = ''
    try {
      action = String((route.request().postDataJSON() as { action?: string } | null)?.action ?? '')
    } catch {
      /* cuerpo no JSON */
    }
    return json(route, aiResponse(action))
  })

  // 3) Supabase falso.
  await page.route(`${MOCK_SUPABASE_URL}/**`, async (route) => {
    const req = route.request()
    const url = new URL(req.url())
    const path = url.pathname
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 204, headers: CORS })
    }
    if (path.startsWith('/rest/v1/rpc/')) return json(route, {})
    if (path.startsWith('/rest/v1/')) {
      const table = decodeURIComponent(path.slice('/rest/v1/'.length).split('/')[0])
      return store.handle(route, table, url)
    }
    if (path.startsWith('/auth/v1/')) {
      const endpoint = path.slice('/auth/v1/'.length)
      if (endpoint.startsWith('user')) return json(route, mockUser())
      if (endpoint.startsWith('token')) return json(route, mockSession())
      if (endpoint.startsWith('logout')) return route.fulfill({ status: 204, headers: CORS, body: '' })
      return json(route, {})
    }
    if (path.startsWith('/storage/v1/')) return json(route, {})
    return json(route, {})
  })
}

/** Engancha los listeners de consola/errores/peticiones fallidas. */
export function attachLogging(page: Page, log: PageLog) {
  page.on('console', (msg) => {
    // Los bloqueos propios (fuentes externas) ya quedan en `blocked`.
    if (msg.type() === 'error' && !msg.text().includes('ERR_BLOCKED_BY_CLIENT')) log.consoleErrors.push(msg.text())
  })
  page.on('pageerror', (err) => log.pageErrors.push(String(err?.message ?? err)))
  page.on('requestfailed', (req) => {
    const failure = req.failure()?.errorText ?? 'failed'
    if (failure.includes('BLOCKED_BY_CLIENT')) return // ya está en `blocked`
    log.failedRequests.push(`${req.method()} ${req.url()} — ${failure}`)
  })
  page.on('response', (res) => {
    if (res.status() >= 400) log.httpErrors.push(`${res.status()} ${res.request().method()} ${res.url()}`)
  })
}
