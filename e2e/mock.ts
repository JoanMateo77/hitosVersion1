/**
 * Backend falso para las capturas: intercepta en el navegador cada petición que
 * iría a Supabase (mock.supabase.test) y a /api/plan-meta, y aborta cualquier otra
 * petición que no sea a localhost. Nada sale a la red real.
 *
 * El mock de PostgREST es genérico: tabla por ruta, filtros simples del query
 * string (eq/neq/in/is/gt/gte/lt/lte, con `not.`), order, limit, objeto único
 * (Accept: application/vnd.pgrst.object+json) y escrituras que devuelven la fila.
 */
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Page, Request, Route } from '@playwright/test'
import { aiResponse } from './fixtures/ai'
import type { Row, Tables } from './fixtures/data'
import { MOCK_SUPABASE_URL, mockSession, mockUser } from './fixtures/session'
import { ROOT } from './paths'

/** Las respuestas cruzan de origen (localhost → mock.supabase.test): CORS abierto. */
const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-headers': '*',
  'access-control-allow-methods': '*',
  'access-control-expose-headers': 'content-range',
}

/** Foto de portada de prueba (local): la misma para cualquier objeto del bucket. */
const COVER_JPG = readFileSync(join(ROOT, 'e2e', 'fixtures', 'cover.jpg'))

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

/** Texto de un valor de celda: primitivos tal cual, objetos/arrays como JSON. */
function cellText(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') return value.toString()
  if (value == null) return ''
  return JSON.stringify(value)
}

function compare(a: unknown, b: string): number {
  const na = Number(a)
  const nb = Number(b)
  if (typeof a === 'number' || (a !== '' && a !== null && !Number.isNaN(na) && !Number.isNaN(nb) && /^-?\d+(\.\d+)?$/.test(b))) {
    return na - nb
  }
  return cellText(a).localeCompare(b)
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
      ok = value != null && cellText(value) === unquote(raw)
      break
    case 'neq':
      ok = value == null || cellText(value) !== unquote(raw)
      break
    case 'is':
      ok = raw === 'null' ? value == null : cellText(value) === raw
      break
    case 'in': {
      const list = raw.replace(/^\(|\)$/g, '').split(',').map(unquote)
      ok = value != null && list.includes(cellText(value))
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

interface OrderKey {
  col: string
  desc: boolean
  nullsFirst: boolean
}

function parseOrder(order: string): OrderKey[] {
  return order.split(',').map((part) => {
    const [col, ...mods] = part.split('.')
    return { col, desc: mods.includes('desc'), nullsFirst: mods.includes('nullsfirst') }
  })
}

/** Compara dos filas por una columna; los nulos van al final (o al inicio con `nullsfirst`). */
function compareByKey(a: Row, b: Row, k: OrderKey): number {
  const va = a[k.col]
  const vb = b[k.col]
  if (va == null && vb == null) return 0
  const nullSign = k.nullsFirst ? -1 : 1
  if (va == null) return nullSign
  if (vb == null) return -nullSign
  const c = compare(va, cellText(vb))
  return k.desc ? -c : c
}

function applyOrder(rows: Row[], order: string | null): Row[] {
  if (!order) return rows
  const keys = parseOrder(order)
  return [...rows].sort((a, b) => {
    for (const k of keys) {
      const c = compareByKey(a, b, k)
      if (c !== 0) return c
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
    const prefer = headers['prefer'] ?? ''
    const single = (headers['accept'] ?? '').includes('vnd.pgrst.object')
    const params = url.searchParams

    if (method === 'POST') {
      const posted = this.insert(table, req.postDataJSON() as Row | Row[], params, prefer)
      if (posted === 'duplicate') return fulfillDuplicate(route)
      return respond(route, { method, prefer, single, result: posted, status: 201 })
    }
    return respond(route, { method, prefer, single, result: this.query(table, method, req, params), status: 200 })
  }

  /** GET/HEAD, PATCH y DELETE: filtran las filas y (salvo GET) las modifican. */
  private query(table: string, method: string, req: Request, params: URLSearchParams): Row[] {
    const all = this.rows(table)
    if (method === 'PATCH') {
      const patch = req.postDataJSON() as Row
      const result = applyFilters(all, params)
      for (const r of result) Object.assign(r, patch)
      return result
    }
    if (method === 'DELETE') {
      const result = applyFilters(all, params)
      this.tables[table] = all.filter((r) => !result.includes(r))
      return result
    }
    if (method !== 'GET' && method !== 'HEAD') return []
    const result = applyOrder(this.withEmbeds(table, applyFilters(all, params), params), params.get('order'))
    const limit = Number(params.get('limit'))
    return limit > 0 ? result.slice(0, limit) : result
  }

  /** POST con upsert (`on_conflict` + `resolution=…`); 'duplicate' = choque de PK en habit_checks. */
  private insert(table: string, body: Row | Row[], params: URLSearchParams, prefer: string): Row[] | 'duplicate' {
    const all = this.rows(table)
    const incoming = Array.isArray(body) ? body : [body]
    const conflict = params.get('on_conflict')?.split(',')
    const result: Row[] = []
    for (const item of incoming) {
      const existing = conflict ? all.find((r) => conflict.every((c) => cellText(r[c]) === cellText(item[c]))) : undefined
      if (existing) {
        const kept = upsertExisting(existing, item, prefer)
        if (kept) result.push(kept)
        continue
      }
      if (table === 'habit_checks' && isDuplicateCheck(all, item)) return 'duplicate'
      const row = newRow(table, item)
      all.push(row)
      result.push(row)
    }
    return result
  }
}

/** Fila existente ante un upsert: `merge` la actualiza, `ignore` la omite; sin preferencia se devuelve tal cual. */
function upsertExisting(existing: Row, item: Row, prefer: string): Row | null {
  if (prefer.includes('resolution=merge-duplicates')) return Object.assign(existing, item)
  if (prefer.includes('resolution=ignore-duplicates')) return null
  return existing
}

function isDuplicateCheck(all: Row[], item: Row): boolean {
  return all.some(
    (r) => r.habit_id === item.habit_id && r.date === item.date && (r.slot ?? 0) === (item.slot ?? 0),
  )
}

function newRow(table: string, item: Row): Row {
  const now = new Date().toISOString()
  const row: Row = { ...DEFAULTS[table], created_at: now }
  if (!NO_ID.has(table)) row.id = randomUUID()
  if (table === 'notes') row.updated_at = now
  return { ...row, ...item }
}

function fulfillDuplicate(route: Route): Promise<void> {
  return route.fulfill({
    status: 409,
    headers: CORS,
    contentType: 'application/json',
    body: JSON.stringify({ code: '23505', message: 'duplicate key value violates unique constraint', details: null, hint: null }),
  })
}

interface Reply {
  method: string
  prefer: string
  single: boolean
  result: Row[]
  status: number
}

/** Arma la respuesta PostgREST: HEAD vacío, escrituras sin `return=representation` vacías, objeto único o lista. */
function respond(route: Route, { method, prefer, single, result, status }: Reply): Promise<void> {
  const contentRange = result.length ? `0-${result.length - 1}/${result.length}` : `*/0`
  const respHeaders = { ...CORS, 'content-range': contentRange }

  if (method === 'HEAD') {
    return route.fulfill({ status: 200, headers: respHeaders, body: '' })
  }
  if (method !== 'GET' && !prefer.includes('return=representation')) {
    return route.fulfill({ status: method === 'POST' ? 201 : 204, headers: respHeaders, body: '' })
  }
  if (!single) {
    return route.fulfill({ status, contentType: 'application/json', headers: respHeaders, body: JSON.stringify(result) })
  }
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
    if (path.startsWith('/storage/v1/')) return storage(route, req.method(), path)
    return json(route, {})
  })
}

/**
 * Storage falso: firmar una URL devuelve una ruta del propio mock y pedirla
 * sirve la foto local. Subir y borrar responden OK sin guardar nada.
 */
function storage(route: Route, method: string, urlPath: string): Promise<void> {
  const signPrefix = '/storage/v1/object/sign/'
  if (urlPath.startsWith(signPrefix) && method === 'POST') {
    return json(route, { signedURL: `/object/sign/${urlPath.slice(signPrefix.length)}?token=mock` })
  }
  if (urlPath.startsWith(signPrefix) && method === 'GET') {
    return route.fulfill({ status: 200, headers: CORS, contentType: 'image/jpeg', body: COVER_JPG })
  }
  return json(route, {})
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
