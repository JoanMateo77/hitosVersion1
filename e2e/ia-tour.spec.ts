/**
 * Tour de "Organizar con IA": aparece la primera vez, avanza tocando el botón,
 * sigue dentro de la hoja y no vuelve a salir. Supabase e IA falsos (e2e/mock.ts).
 */
import { expect, test, type Browser } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

async function open(browser: Browser, viewport: { width: number; height: number }, path = '/', tourDone = false) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'es-CO' })
  const page = await context.newPage()
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.addInitScript(
    ({ key, session, tourDone }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
      if (tourDone) localStorage.setItem('logralo.tour.organizar-ia', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession(), tourDone },
  )
  await page.goto(path)
  return { context, page }
}

for (const viewport of [
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
]) {
  test(`walks through the organize-with-AI tour (${viewport.width}px)`, async ({ browser }) => {
    const { context, page } = await open(browser, viewport)
    const bubble = page.locator('.tour-bubble')
    await expect(bubble).toContainText('1 de 3')
    await expect(bubble).toContainText('Organiza tu día con IA')
    await page.screenshot({ path: test.info().outputPath(`tour-1-${viewport.width}.png`) })

    // Tocar el botón señalado abre la hoja y pasa al paso 2.
    await page.getByRole('button', { name: /Organizar mi día con IA/ }).click()
    const sheet = page.getByRole('dialog', { name: /Organizar el/ })
    await expect(sheet).toBeVisible()
    await expect(bubble).toContainText('2 de 3')
    await page.waitForTimeout(500)
    await page.screenshot({ path: test.info().outputPath(`tour-2-${viewport.width}.png`) })

    // Un ejemplo llena el cuadro de texto.
    await sheet.getByRole('button', { name: /ordenar la casa/ }).click()
    await expect(sheet.getByLabel('Cuéntame tu día')).toHaveValue(/ordenar la casa 1 h/)

    await bubble.getByRole('button', { name: 'Siguiente' }).click()
    await expect(bubble).toContainText('3 de 3')
    await page.waitForTimeout(400)
    await page.screenshot({ path: test.info().outputPath(`tour-3-${viewport.width}.png`) })
    await bubble.getByRole('button', { name: 'Entendido' }).click()
    await expect(bubble).toHaveCount(0)
    // El tour no cerró la hoja.
    await expect(sheet).toBeVisible()

    // "¿Cómo funciona?" lo repite desde el paso del cuadro de texto.
    await sheet.getByRole('button', { name: '¿Cómo funciona?' }).click()
    await expect(bubble).toContainText('2 de 3')

    // Escape cierra el tour sin cerrar la hoja.
    await page.keyboard.press('Escape')
    await expect(bubble).toHaveCount(0)
    await expect(sheet).toBeVisible()
    await context.close()
  })
}

test('skipping the tour is remembered after reloading', async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 800 })
  await page.locator('.tour-bubble').getByRole('button', { name: 'Saltar guía' }).click()
  await expect(page.locator('.tour-bubble')).toHaveCount(0)
  await page.reload()
  await expect(page.getByRole('button', { name: /Organizar mi día con IA/ })).toBeVisible()
  await expect(page.locator('.tour-bubble')).toHaveCount(0)
  await context.close()
})

test('the tour also starts from the Agenda button', async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 800 }, '/calendario')
  await expect(page.locator('.tour-bubble')).toContainText('1 de 3')
  await page.getByRole('button', { name: 'Organizar con IA' }).click()
  await expect(page.locator('.tour-bubble')).toContainText('2 de 3')
  await context.close()
})

test('opening the planner from a link jumps the tour to the text box', async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 800 }, '/calendario?organizar=1')
  await expect(page.getByRole('dialog', { name: /Organizar el/ })).toBeVisible()
  await expect(page.locator('.tour-bubble')).toContainText('2 de 3')
  await context.close()
})

test('Escape goes to the sheet when the tour is waiting off screen', async ({ browser }) => {
  const { context, page } = await open(browser, { width: 390, height: 800 }, '/calendario')
  await expect(page.locator('.tour-bubble')).toContainText('1 de 3')
  // Una hoja ajena tapa el botón señalado: el globo se oculta y Escape cierra la hoja.
  await page.getByRole('button', { name: 'Agregar a la agenda' }).click()
  const other = page.getByRole('dialog').first()
  await expect(other).toBeVisible()
  await expect(page.locator('.tour-bubble')).toHaveCount(0)
  await page.keyboard.press('Escape')
  await expect(page.locator('.sheet')).toHaveCount(0)
  // Con el botón otra vez a la vista, el globo vuelve.
  await expect(page.locator('.tour-bubble')).toContainText('1 de 3')
  await context.close()
})

