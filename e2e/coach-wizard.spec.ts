/**
 * El coach del paso "Arma tu camino": lo que la persona escribe con una
 * pregunta abierta la responde, y un camino completo llega como una sola
 * propuesta que reemplaza las etapas al aplicarla.
 */
import { expect, test, type Browser, type Page } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { aiResponse } from './fixtures/ai'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

const STAGES = [
  'Hacer revisión oftalmológica y ajustar ergonomía',
  'Establecer pausas activas y descanso visual diario',
  'Probar lentes con filtro azul y elegir modelo',
]
const PATH = [
  'Pedir cita con el optómetra',
  'Probar lentes con filtro azul y elegir modelo',
  'Cotizar en tres ópticas',
  'Comprar las gafas y recogerlas',
]
const PATH_REPLY = {
  reply: 'Te propongo este camino hasta tener tus gafas.',
  proposal: {
    kind: 'stages',
    summary: 'Camino completo hasta comprar las gafas.',
    changes: [
      { kind: 'remove', title: STAGES[0] },
      { kind: 'remove', title: STAGES[1] },
      { kind: 'add', title: PATH[0], afterTitle: null },
      { kind: 'add', title: PATH[2], afterTitle: PATH[1] },
      { kind: 'add', title: PATH[3], afterTitle: PATH[2] },
    ],
    path: PATH,
  },
}

async function settle(page: Page) {
  await page.waitForFunction(() =>
    document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
  )
}

/** Paso 4 del asistente con tres etapas escritas y el coach todavía sin preguntar. */
async function openPathStep(browser: Browser, viewport: { width: number; height: number }) {
  const context = await browser.newContext({ viewport, serviceWorkers: 'block', locale: 'es-CO' })
  const page = await context.newPage()
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  const actions: Record<string, unknown>[] = []
  await page.route('**/api/plan-meta', (route) => {
    const body = route.request().postDataJSON() as Record<string, unknown>
    actions.push(body)
    const data = body.action === 'chat' ? PATH_REPLY : aiResponse(String(body.action))
    return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(data) })
  })
  await page.addInitScript(
    ({ key, session, draft }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
      if (!sessionStorage.getItem('logralo.wizard-draft-v2')) {
        sessionStorage.setItem('logralo.wizard-draft-v2', JSON.stringify(draft))
      }
    },
    {
      key: SESSION_STORAGE_KEY,
      session: mockSession(),
      draft: {
        step: 3,
        title: 'Conseguir gafas',
        templateKey: 'salud_fisico',
        why: '',
        targetDate: '',
        area: 'salud',
        criteria: '',
        blocks: [],
        milestones: STAGES.map((title, position) => ({ title, position, targetDate: null, done: false })),
        chat: [],
      },
    },
  )
  await page.goto('/meta/nueva')
  return { context, page, actions }
}

for (const viewport of [
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
]) {
  test(`escribir con una pregunta abierta la responde (${viewport.width}px)`, async ({ browser }) => {
    const { context, page, actions } = await openPathStep(browser, viewport)
    const coach = page.getByRole('region', { name: 'Coach de tu meta' })
    await expect(coach.getByText('¿Cuánto corres hoy sin parar?')).toBeVisible()

    const input = coach.getByPlaceholder('O cuéntale con tus palabras…')
    await input.fill('para trabajar, soy programador')
    await input.press('Enter')
    await expect(coach.getByText('¿Qué días tienes más tiempo?')).toBeVisible()
    await expect(coach.locator('.coach-qa').filter({ hasText: 'para trabajar, soy programador' })).toBeVisible()

    await input.fill('los fines de semana')
    await input.press('Enter')
    await expect.poll(() => actions.find((a) => a.action === 'plan')?.answers).toEqual([
      { question: '¿Cuánto corres hoy sin parar?', answer: 'para trabajar, soy programador' },
      { question: '¿Qué días tienes más tiempo?', answer: 'los fines de semana' },
    ])
    expect(actions.some((a) => a.action === 'chat')).toBe(false)
    await context.close()
  })

  test(`el camino completo llega en una propuesta y se aplica entero (${viewport.width}px)`, async ({ browser }) => {
    const { context, page, actions } = await openPathStep(browser, viewport)
    const coach = page.getByRole('region', { name: 'Coach de tu meta' })
    await coach.getByRole('button', { name: 'Saltar preguntas' }).click()
    const input = coach.getByPlaceholder('Cuéntale con tus palabras…')
    await expect(input).toBeVisible()
    await input.fill('haz todo el plan hasta que las compro')
    await input.press('Enter')

    const proposed = page.getByRole('list', { name: 'Camino propuesto' })
    await expect(proposed.getByRole('listitem')).toHaveText(PATH)
    expect(actions.find((a) => a.action === 'chat')).toMatchObject({ designing: true })
    await proposed.scrollIntoViewIfNeeded()
    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`camino-propuesto-${viewport.width}.png`) })

    await page.getByRole('button', { name: 'Aplicar', exact: true }).click()
    await expect(page.getByText('Aplicado')).toBeVisible()
    const draft = await page.evaluate(() => JSON.parse(sessionStorage.getItem('logralo.wizard-draft-v2') ?? '{}'))
    expect((draft.milestones as { title: string }[]).map((m) => m.title)).toEqual(PATH)
    await context.close()
  })
}
