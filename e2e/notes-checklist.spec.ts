/**
 * Marcar puntos de una nota con lista: lo marcado tiene que llegar a la base y
 * seguir marcado al volver a abrir la nota. Supabase es falso (e2e/mock.ts).
 */
import { expect, test, type Page } from '@playwright/test'
import { GOAL_IDS, buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

const NOTE = 'Frases para reuniones'
const ITEM = 'What would success look like?'

async function open(page: Page, tables = buildFixtures({ onboarded: true })) {
  await installMocks(page, tables, newLog())
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto('/notas?vista=goals')
}

/** Cuerpos de los PATCH a la tabla notes. */
function notePatches(page: Page): unknown[] {
  const bodies: unknown[] = []
  page.on('request', (req) => {
    if (req.method() === 'PATCH' && new URL(req.url()).pathname === '/rest/v1/notes') bodies.push(req.postDataJSON())
  })
  return bodies
}

for (const viewport of [
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
]) {
  test(`checking a list item is saved and survives reopening (${viewport.width}px)`, async ({ browser }) => {
    const page = await browser.newPage({ viewport })
    const patches = notePatches(page)
    await open(page)

    await page.getByText(NOTE).first().click()
    const dialog = page.getByRole('dialog')
    await dialog.getByRole('button', { name: `Marcar: ${ITEM}` }).click()
    await expect(dialog.getByRole('button', { name: `Desmarcar: ${ITEM}` })).toBeVisible()
    await dialog.getByRole('button', { name: 'Listo' }).click()
    await expect(dialog).toBeHidden()

    await expect.poll(() => patches.length).toBeGreaterThan(0)
    expect(patches.at(-1)).toMatchObject({ items: expect.arrayContaining([{ text: ITEM, done: true }]) })

    await page.getByText(NOTE).first().click()
    await expect(page.getByRole('dialog').getByRole('button', { name: `Desmarcar: ${ITEM}` })).toBeVisible()
    await page.close()
  })
}

/** Simula que la app pasa a segundo plano (otra app, bloqueo) o vuelve al frente. */
async function setVisibility(page: Page, state: 'hidden' | 'visible') {
  await page.evaluate((s) => {
    Object.defineProperty(document, 'visibilityState', { value: s, configurable: true })
    Object.defineProperty(document, 'hidden', { value: s === 'hidden', configurable: true })
    document.dispatchEvent(new Event('visibilitychange'))
  }, state)
}

test('checked items are saved when the app goes to the background with the note open', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const patches = notePatches(page)
  await open(page)

  await page.getByText(NOTE).first().click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: `Marcar: ${ITEM}` }).click()
  await setVisibility(page, 'hidden')

  await expect.poll(() => patches.length).toBeGreaterThan(0)
  expect(patches.at(-1)).toMatchObject({ items: expect.arrayContaining([{ text: ITEM, done: true }]) })
  // La hoja sigue abierta: volver a la app no la cierra.
  await setVisibility(page, 'visible')
  await expect(dialog.getByRole('button', { name: `Desmarcar: ${ITEM}` })).toBeVisible()
  await page.close()
})

test('returning to the app reloads notes edited on another device', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const tables = buildFixtures({ onboarded: true })
  await open(page, tables)
  await expect(page.getByText(NOTE).first()).toBeVisible()

  // Otro dispositivo marca el punto mientras esta pantalla sigue abierta.
  const row = (tables.notes as Array<Record<string, unknown>>).find((n) => n.title === NOTE)!
  row.items = (row.items as Array<{ text: string; done: boolean }>).map((i) => ({ ...i, done: true }))
  row.updated_at = new Date().toISOString()

  await setVisibility(page, 'hidden')
  await setVisibility(page, 'visible')

  await page.getByText(NOTE).first().click()
  await expect(page.getByRole('dialog').getByRole('button', { name: `Desmarcar: ${ITEM}` })).toBeVisible()
  await page.close()
})

test('a goal page reloads its notes when returning to the app', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const tables = buildFixtures({ onboarded: true })
  await open(page, tables)
  await page.goto(`/metas/${GOAL_IDS.aprendizaje}`)
  await expect(page.getByText(NOTE).first()).toBeVisible()

  const row = (tables.notes as Array<Record<string, unknown>>).find((n) => n.title === NOTE)!
  row.items = (row.items as Array<{ text: string; done: boolean }>).map((i) => ({ ...i, done: true }))

  await setVisibility(page, 'hidden')
  await setVisibility(page, 'visible')

  await page.getByText(NOTE).first().click()
  await expect(page.getByRole('dialog').getByRole('button', { name: `Desmarcar: ${ITEM}` })).toBeVisible()
  await page.close()
})
