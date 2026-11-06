/**
 * El chat del coach en el detalle de una meta sigue usable en una conversación
 * larga: tras cada respuesta, la caja de texto está en pantalla y habilitada.
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildFixtures, GOAL_IDS } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

async function inViewport(page: Page, el: Locator) {
  const box = await el.boundingBox()
  const vp = page.viewportSize()!
  return box !== null && box.y >= 0 && box.y + box.height <= vp.height
}

async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

for (const viewport of [
  { width: 390, height: 700 },
  { width: 1280, height: 800 },
]) {
  test(`conversación larga en ${viewport.width}px: la caja de texto sigue a mano`, async ({ browser }) => {
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
    await page.goto(`/metas/${GOAL_IDS.salud}`)
    await page.getByRole('button', { name: 'Hablar con el coach' }).click()

    const input = page.getByLabel('Escríbele al coach')
    const replies = page.locator('.coach-msg--coach')
    // Puede abrir con un aviso del coach: se cuenta desde ahí, con la hoja ya
    // abierta (sin animación en curso) y el historial cargado.
    await expect(input).toBeVisible()
    await page.waitForLoadState('networkidle')
    await settle(page)
    const base = await replies.count()
    for (let i = 1; i <= 8; i++) {
      await expect(input).toBeEnabled()
      expect(await inViewport(page, input), `caja visible antes del mensaje ${i}`).toBe(true)
      await input.fill(`Mensaje número ${i}: hoy avancé un poco y quiero saber cómo seguir con la meta.`)
      await input.press('Enter')
      await expect(replies).toHaveCount(base + i)
      await expect(input).toBeEnabled()
      await settle(page)
      expect(await inViewport(page, input), `caja visible tras la respuesta ${i}`).toBe(true)
      // La última respuesta también se ve (el hilo hizo scroll hasta ella) y no
      // queda debajo de la caja de texto.
      expect(await inViewport(page, replies.last()), `respuesta ${i} visible`).toBe(true)
      const reply = (await replies.last().boundingBox())!
      const box = (await input.boundingBox())!
      expect(reply.y + reply.height, `respuesta ${i} no tapa la caja`).toBeLessThanOrEqual(box.y)
    }
    // La caja recibe el clic de verdad (nada encima la tapa).
    await input.click({ trial: true })
    await input.fill('Último mensaje')
    await expect(input).toHaveValue('Último mensaje')
    await expect(page.getByRole('button', { name: 'Enviar' })).toBeEnabled()
    await page.screenshot({ path: test.info().outputPath(`chat-${viewport.width}.png`) })
    await context.close()
  })
}

test('tocar el fondo oscuro cierra la hoja del chat', async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 700 }, serviceWorkers: 'block', locale: 'es-CO' })
  const page = await context.newPage()
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto(`/metas/${GOAL_IDS.salud}`)
  await page.getByRole('button', { name: 'Hablar con el coach' }).click()
  await expect(page.getByRole('dialog', { name: 'Hablar con la meta' })).toBeVisible()
  await settle(page)
  // Arriba de la hoja solo hay fondo.
  await page.mouse.click(195, 20)
  await expect(page.getByRole('dialog', { name: 'Hablar con la meta' })).toBeHidden()
  await context.close()
})
