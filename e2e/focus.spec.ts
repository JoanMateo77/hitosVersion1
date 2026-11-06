/**
 * El foco inicial cae donde se escribe: en el título del evento nuevo (dentro de
 * la hoja, con su trampa de foco) y en la meta del primer paso del wizard.
 */
import { expect, test, type Browser } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

async function signedIn(browser: Browser, path: string) {
  const context = await browser.newContext({ viewport: { width: 390, height: 800 }, serviceWorkers: 'block', locale: 'es-CO' })
  const page = await context.newPage()
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto(path)
  return { context, page }
}

test('evento nuevo: el foco arranca en el título y el tipo es un grupo con nombre', async ({ browser }) => {
  const { context, page } = await signedIn(browser, '/calendario')
  await page.getByRole('button', { name: 'Agregar a la agenda' }).click()
  await page.getByRole('button', { name: 'Evento' }).click()
  const dialog = page.getByRole('dialog', { name: 'Nuevo evento' })
  await expect(dialog.getByPlaceholder('¿Qué tienes? Ej: Clase de inglés')).toBeFocused()
  await expect(dialog.getByRole('group', { name: 'Tipo de evento' })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('evento-nuevo.png') })
  await context.close()
})

test('wizard: el foco arranca en la meta', async ({ browser }) => {
  const { context, page } = await signedIn(browser, '/meta/nueva')
  await expect(page.getByLabel('¿Qué quieres lograr?')).toBeFocused()
  await context.close()
})
