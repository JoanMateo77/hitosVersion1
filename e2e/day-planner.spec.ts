/**
 * "Organizar el día con IA": contar el día, ver el borrador, resolver el choque,
 * aplicar y deshacer. La IA y Supabase son falsos (e2e/mock.ts, fixtures/ai.ts).
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

/** Mañana en ISO local: un día futuro no depende de la hora en que corre la prueba. */
function tomorrowISO(): string {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

async function openPlanner(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'es-CO' })
  const page = await context.newPage()
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto(`/calendario?d=${tomorrowISO()}&organizar=1`)
  return { context, page }
}

for (const viewport of [
  { width: 390, height: 700 },
  { width: 1280, height: 800 },
]) {
  test(`organizes the day from text and applies it (${viewport.width}px)`, async ({ browser }) => {
    const { context, page } = await openPlanner(browser, viewport)
    const sheet = page.getByRole('dialog', { name: /Organizar el/ })
    const input = sheet.getByLabel('Cuéntame tu día')
    await expect(input).toBeVisible()

    await input.fill('Reunión de 9 a 11, llamar al banco a las 10 y avanzar la tesis por la tarde')
    await input.press('Enter')
    await expect(sheet.getByText('Entendí tu reunión')).toBeVisible()

    const draft = sheet.getByRole('region', { name: 'Borrador del día' })
    await expect(draft.getByText('Reunión', { exact: true })).toBeVisible()
    await expect(draft.getByText('Tesis', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Supuse 2 h para la tesis')).toBeVisible()
    // Lo que ya había en el día sigue en el borrador (no se pierde).
    await expect(draft.getByText('Meditar 10 minutos al día')).toBeVisible()

    // Pregunta del algoritmo (choque), antes que la de la IA.
    await expect(sheet.getByText(/Reunión \(9:00 am–11:00 am\) y Llamada al banco \(10:00 am\) chocan/)).toBeVisible()
    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`draft-${viewport.width}.png`) })
    await sheet.getByRole('button', { name: 'Sí, a la vez' }).click()
    await expect(sheet.getByText(/chocan/)).toHaveCount(0)
    await expect(draft.getByText(/A la vez con Reunión/)).toBeVisible()

    await sheet.getByRole('button', { name: 'Aplicar (3 cambios)' }).click()
    await expect(sheet.getByRole('button', { name: 'Deshacer' })).toBeVisible()
    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`applied-${viewport.width}.png`) })

    await sheet.getByRole('button', { name: 'Deshacer' }).click()
    await expect(sheet.getByRole('button', { name: 'Aplicar (3 cambios)' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Aplicar (3 cambios)' }).click()
    await sheet.getByRole('button', { name: 'Listo' }).click()
    await expect(sheet).toHaveCount(0)
    await expect(page.getByText('Llamada al banco').first()).toBeVisible()
    await context.close()
  })
}

test('composer stays usable while the AI responds', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 700 })
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  // La IA tarda: el campo sigue habilitado; solo el botón de enviar espera.
  await page.route('**/api/plan-meta', async (route) => {
    await gate
    await route.fallback()
  })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  const input = sheet.getByLabel('Cuéntame tu día')
  await input.fill('Gimnasio a las 7')
  await input.press('Enter')
  await expect(sheet.getByLabel('Organizando tu día')).toBeVisible()
  await expect(input).toBeEnabled()
  await input.fill('y almuerzo a la 1')
  await expect(input).toHaveValue('y almuerzo a la 1')
  await expect(sheet.getByRole('button', { name: 'Enviar' })).toBeDisabled()
  release()
  await expect(sheet.getByText('Entendí tu reunión')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Enviar' })).toBeEnabled()
  await context.close()
})

test('closing with unapplied changes asks first', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 700 })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  await sheet.getByLabel('Cuéntame tu día').fill('Reunión de 9 a 11')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  await expect(sheet.getByText('Entendí tu reunión')).toBeVisible()
  const confirm = sheet.getByText('¿Salir sin aplicar? Se perderá el borrador.')
  // Escape pasa por la misma protección que el botón ✕.
  await page.keyboard.press('Escape')
  await expect(confirm).toBeVisible()
  await sheet.getByRole('button', { name: 'Seguir' }).click()
  await expect(confirm).toHaveCount(0)
  await sheet.locator('.iconbtn[aria-label="Cerrar"]').click()
  await expect(confirm).toBeVisible()
  await sheet.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await context.close()
})
