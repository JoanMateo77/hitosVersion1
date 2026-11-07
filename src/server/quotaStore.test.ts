import { afterEach, describe, expect, it, vi } from 'vitest'
import { createSupabaseQuota } from './quotaStore'

const URL = 'https://db.example'
const KEY = 'anon'

function respond(status: number, body: unknown) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })
}

afterEach(() => vi.unstubAllGlobals())

describe('createSupabaseQuota', () => {
  it('charges through the take RPC with the user token and the limit', async () => {
    const fetchMock = vi.fn(async () => respond(200, '2026-11-07'))
    vi.stubGlobal('fetch', fetchMock)
    const take = createSupabaseQuota(URL, KEY, 50, () => null)
    expect(await take('u1', 'tok')).not.toBeNull()
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit]
    expect(url).toBe(`${URL}/rest/v1/rpc/ai_quota_take`)
    expect(init.method).toBe('POST')
    expect(init.headers).toMatchObject({ apikey: KEY, Authorization: 'Bearer tok' })
    expect(JSON.parse(init.body as string)).toEqual({ p_limit: 50 })
  })

  it('returns null when the database says the limit was reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => respond(200, null)))
    const take = createSupabaseQuota(URL, KEY, 50, () => null)
    expect(await take('u1', 'tok')).toBeNull()
  })

  it('refunds the charged day once', async () => {
    const fetchMock = vi.fn(async (url: string) => (url.endsWith('ai_quota_take') ? respond(200, '2026-11-07') : respond(204, null)))
    vi.stubGlobal('fetch', fetchMock)
    const take = createSupabaseQuota(URL, KEY, 50, () => null)
    const refund = (await take('u1', 'tok'))!
    await refund()
    await refund()
    const refunds = fetchMock.mock.calls.filter(([u]) => String(u).endsWith('ai_quota_refund'))
    expect(refunds).toHaveLength(1)
    expect(JSON.parse((refunds[0] as unknown as [string, RequestInit])[1].body as string)).toEqual({ p_day: '2026-11-07' })
  })

  it('falls back to the memory quota when the database fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => respond(404, { message: 'function not found' })))
    const memRefund = vi.fn()
    const memory = vi.fn(() => memRefund)
    const take = createSupabaseQuota(URL, KEY, 50, memory)
    const refund = await take('u1', 'tok')
    expect(memory).toHaveBeenCalledWith('u1')
    await refund!()
    expect(memRefund).toHaveBeenCalledTimes(1)
  })

  it('falls back on a network error and respects the memory limit', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new Error('offline'))))
    const take = createSupabaseQuota(URL, KEY, 50, () => null)
    expect(await take('u1', 'tok')).toBeNull()
  })

  it('a failed refund does not throw', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.stubGlobal(
      'fetch',
      vi.fn(async (url: string) => (url.endsWith('ai_quota_take') ? respond(200, '2026-11-07') : Promise.reject(new Error('offline')))),
    )
    const take = createSupabaseQuota(URL, KEY, 50, () => null)
    const refund = (await take('u1', 'tok'))!
    await expect(refund()).resolves.toBeUndefined()
  })
})
