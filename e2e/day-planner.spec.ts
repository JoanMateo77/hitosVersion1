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
      // El tour tiene su propia prueba (ia-tour.spec.ts); aquí ya se vio.
      localStorage.setItem('logralo.tour.organizar-ia', '1')
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
    const eventPosts: Array<Record<string, unknown>> = []
    page.on('request', (req) => {
      if (req.method() === 'POST' && new URL(req.url()).pathname === '/rest/v1/events') eventPosts.push(req.postDataJSON())
    })
    const sheet = page.getByRole('dialog', { name: /Organizar el/ })
    const input = sheet.getByLabel('Cuéntame tu día')
    await expect(input).toBeVisible()

    await input.fill('Reunión de 9 a 11, llamar al banco a las 10 y avanzar la tesis por la tarde')
    await input.press('Enter')
    await expect(sheet.getByText('Entendí tu reunión')).toBeVisible()

    const draft = sheet.getByRole('region', { name: 'Borrador del día' })
    // Lo nuevo va arriba, aparte de lo que ya había.
    const changes = sheet.getByRole('region', { name: 'Lo que cambia' })
    await expect(changes.getByText('Esto se agregará a tu día')).toBeVisible()
    await expect(changes.getByText('Reunión', { exact: true })).toBeVisible()
    await expect(changes.getByText('Tesis', { exact: true })).toBeVisible()
    await expect(sheet.getByText('Supuse 2 h para la tesis')).toBeVisible()
    // Lo que ya había sigue en el borrador, plegado (no se pierde).
    await expect(draft.getByText('Meditar 10 minutos al día')).toBeHidden()
    await draft.getByRole('button', { name: /Ver el resto de tu día/ }).click()
    await expect(draft.getByText('Meditar 10 minutos al día')).toBeVisible()

    // Pregunta del algoritmo (choque), antes que la de la IA.
    await expect(sheet.getByText(/Reunión \(9:00 am–11:00 am\) y Llamada al banco \(10:00 am\) chocan/)).toBeVisible()
    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`draft-${viewport.width}.png`) })
    await sheet.getByRole('button', { name: 'Sí, a la vez' }).click()
    await expect(sheet.getByText(/chocan/)).toHaveCount(0)
    await expect(draft.getByText(/A la vez con Reunión/)).toBeVisible()

    await sheet.getByRole('button', { name: 'Agregar 3 cosas a mi agenda' }).click()
    await expect(sheet.getByRole('button', { name: 'Deshacer' })).toBeVisible()
    await expect(sheet.getByText('Agregué 3 cosas a tu día.')).toBeVisible()
    // Cada evento se guarda con el área que eligió la IA (su color en la agenda).
    expect(eventPosts.map((b) => [b.title, b.area])).toEqual(
      expect.arrayContaining([
        ['Reunión', 'carrera'],
        ['Llamada al banco', 'finanzas'],
        ['Tesis', 'aprendizaje'],
      ]),
    )
    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`applied-${viewport.width}.png`) })

    await sheet.getByRole('button', { name: 'Deshacer' }).click()
    await expect(sheet.getByRole('button', { name: 'Agregar 3 cosas a mi agenda' })).toBeVisible()
    await sheet.getByRole('button', { name: 'Agregar 3 cosas a mi agenda' }).click()
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

test('an AI question stays when its answer fails to send, and manual reorganize asks first', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 700 })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  await sheet.getByLabel('Cuéntame tu día').fill('Reunión de 9 a 11 y tesis')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  const question = sheet.getByText('¿Cuánto tiempo quieres dedicarle a la tesis?')
  await expect(question).toBeVisible()

  // La siguiente llamada a la IA falla: la pregunta no se pierde.
  await page.route('**/api/plan-meta', (route) =>
    route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: { code: 'ai_unavailable' } }) }),
  )
  await sheet.getByRole('button', { name: '1 h', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Reorganizar a mano' })).toBeVisible()
  await expect(question).toBeVisible()

  // Con borrador sin aplicar, "Reorganizar a mano" también pregunta.
  await sheet.getByRole('button', { name: 'Reorganizar a mano' }).click()
  await expect(sheet.getByText('¿Salir sin aplicar? Se perderá el borrador.')).toBeVisible()
  await sheet.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(page.getByRole('dialog', { name: /Reorganizar el/ })).toBeVisible()
  await context.close()
})

test('draft items cannot be edited while the AI responds', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 700 })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  const input = sheet.getByLabel('Cuéntame tu día')
  await input.fill('Reunión de 9 a 11')
  await input.press('Enter')
  await expect(sheet.getByText('Entendí tu reunión')).toBeVisible()
  let release: () => void = () => {}
  const gate = new Promise<void>((r) => (release = r))
  await page.route('**/api/plan-meta', async (route) => {
    await gate
    await route.fallback()
  })
  await input.fill('y almuerzo a la 1')
  await input.press('Enter')
  const row = sheet.getByRole('region', { name: 'Borrador del día' }).getByRole('button', { name: /Reunión/ })
  await expect(row).toBeDisabled()
  release()
  await expect(row).toBeEnabled()
  await context.close()
})

/** La IA responde esto (sin preguntas ni choques) en vez de la respuesta de siempre. */
async function aiSays(page: Page, reply: Record<string, unknown>) {
  await page.route('**/api/plan-meta', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(reply) }),
  )
}

const CLEAR_REPLY = {
  reply: 'Te propongo las pruebas de seguridad mientras desarrollas.',
  items: [
    { ref: 'new:1', source: 'new', title: 'Pruebas de seguridad', fixed: true, start: '12:00', durationMin: 120, window: null, mode: 'focus', goalId: null, together: 'g1', untimed: false, area: 'carrera' },
    { ref: 'new:2', source: 'new', title: 'Desarrollar funcionalidades', fixed: false, start: null, durationMin: 90, window: null, mode: 'focus', goalId: null, together: 'g1', untimed: false, area: 'carrera' },
  ],
  questions: [],
  assumptions: [],
  removed: [],
}

test('auto mode applies by itself, joins tasks done together and can be undone', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 800 })
  await aiSays(page, CLEAR_REPLY)
  const posts: unknown[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/events') posts.push(r.postDataJSON())
  })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  const toggle = sheet.getByRole('switch', { name: 'Aplicar solo' })
  await toggle.click()
  await expect(toggle).toHaveAttribute('aria-checked', 'true')

  await sheet.getByLabel('Cuéntame tu día').fill('Pruebas de seguridad a las 12 mientras desarrollo')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  // Sin tocar ningún botón: queda guardado y se puede deshacer.
  await expect(sheet.getByText('Agregué 2 cosas a tu día.')).toBeVisible()
  await expect.poll(() => posts.length).toBe(2)
  const changes = sheet.getByRole('region', { name: 'Lo que se guardó' })
  await expect(changes.getByText(/12:00 pm – 1:30 pm/)).toBeVisible()
  await expect(changes.getByText(/A la vez con Pruebas de seguridad/)).toBeVisible()
  await settle(page)
  await page.screenshot({ path: test.info().outputPath('auto-applied-390.png') })

  await sheet.getByRole('button', { name: 'Deshacer' }).click()
  await expect(sheet.getByRole('button', { name: 'Agregar 2 cosas a mi agenda' })).toBeVisible()

  // El modo se recuerda al volver a abrir.
  await sheet.locator('.iconbtn[aria-label="Cerrar"]').click()
  await sheet.getByRole('button', { name: 'Salir', exact: true }).click()
  await expect(sheet).toHaveCount(0)
  await page.getByRole('button', { name: 'Organizar con IA' }).click()
  await expect(page.getByRole('dialog', { name: /Organizar el/ }).getByRole('switch', { name: 'Aplicar solo' })).toHaveAttribute('aria-checked', 'true')
  await context.close()
})

test('auto mode never moves what you already had without asking', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 800 })
  // A las 3 pm ya está el hábito "Tomar agua": el borrador lo mueve.
  const items = CLEAR_REPLY.items.map((i) => (i.ref === 'new:1' ? { ...i, start: '15:00' } : i))
  await aiSays(page, { ...CLEAR_REPLY, items })
  const posts: unknown[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/events') posts.push(r)
  })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  await sheet.getByRole('switch', { name: 'Aplicar solo' }).click()
  await sheet.getByLabel('Cuéntame tu día').fill('Pruebas de seguridad a las 3 mientras desarrollo')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  await expect(sheet.getByText('Esto mueve cosas que ya tenías: revísalo y guarda.')).toBeVisible()
  await expect(sheet.getByRole('region', { name: 'Lo que cambia' }).getByText('Esto cambia de hora')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Guardar 3 cambios' })).toBeVisible()
  await page.waitForTimeout(500)
  expect(posts).toHaveLength(0)
  await context.close()
})

test('auto mode waits while there are questions', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 800 })
  const posts: unknown[] = []
  page.on('request', (r) => {
    if (r.method() === 'POST' && new URL(r.url()).pathname === '/rest/v1/events') posts.push(r)
  })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  await sheet.getByRole('switch', { name: 'Aplicar solo' }).click()
  await sheet.getByLabel('Cuéntame tu día').fill('Reunión de 9 a 11 y llamar al banco a las 10')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  await expect(sheet.getByText(/chocan/)).toBeVisible()
  await page.waitForTimeout(500)
  expect(posts).toHaveLength(0)
  await expect(sheet.getByRole('button', { name: 'Agregar 3 cosas a mi agenda' })).toBeVisible()
  await context.close()
})

test('without changes there is no apply button: examples at first, a hint after talking', async ({ browser }) => {
  const { context, page } = await openPlanner(browser, { width: 390, height: 800 })
  await aiSays(page, { reply: '¿Qué te gustaría hacer hoy?', items: [], questions: [], assumptions: [], removed: [] })
  const sheet = page.getByRole('dialog', { name: /Organizar el/ })
  await expect(sheet.getByRole('button', { name: /ordenar la casa/ })).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Agregar .* a mi agenda|Guardar/ })).toHaveCount(0)
  await expect(sheet.getByText('Cuando la IA proponga algo, aquí lo guardas en tu agenda.')).toHaveCount(0)
  await sheet.getByLabel('Cuéntame tu día').fill('Hola')
  await sheet.getByLabel('Cuéntame tu día').press('Enter')
  await expect(sheet.getByText('Cuando la IA proponga algo, aquí lo guardas en tu agenda.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: /Agregar .* a mi agenda|Guardar/ })).toHaveCount(0)
  await context.close()
})


const AFTERNOON_REPLY = {
  reply: 'Te propongo juntar la auditoría con los hallazgos de QA porque los agentes trabajan mientras tú avanzas, y dejar la demo de Hunter sola para que la leas con calma.',
  items: [
    { ref: 'new:1', source: 'new', title: 'Hallazgos de QA', fixed: false, start: null, durationMin: 120, window: 'afternoon', mode: 'focus', goalId: null, together: 'g1', untimed: false, area: 'carrera' },
    { ref: 'new:2', source: 'new', title: 'Auditoría con IA', fixed: false, start: null, durationMin: 90, window: 'afternoon', mode: 'focus', goalId: null, together: 'g1', untimed: false, area: 'carrera' },
    { ref: 'new:3', source: 'new', title: 'Gestor de gastos', fixed: false, start: null, durationMin: 60, window: 'afternoon', mode: 'focus', goalId: null, together: 'g1', untimed: false, area: 'creatividad' },
    { ref: 'new:4', source: 'new', title: 'Revisar demo de Hunter', fixed: false, start: null, durationMin: 60, window: 'afternoon', mode: 'focus', goalId: null, together: null, solo: true, untimed: false, area: 'carrera' },
    { ref: 'new:5', source: 'new', title: 'Pulir demo de inglés', fixed: false, start: null, durationMin: 300, window: 'afternoon', mode: 'focus', goalId: null, together: null, untimed: false, area: 'aprendizaje' },
  ],
  questions: [],
  assumptions: [],
  removed: [],
  limits: { start: null, end: '17:30' },
}

for (const viewport of [
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
]) {
  test(`respects the day limit, groups tasks and keeps solo ones apart (${viewport.width}px)`, async ({ browser }) => {
    const { context, page } = await openPlanner(browser, viewport)
    await aiSays(page, AFTERNOON_REPLY)
    const sheet = page.getByRole('dialog', { name: /Organizar el/ })
    await sheet.getByLabel('Cuéntame tu día').fill('De aquí a las 5:30; los agentes auditan mientras hago QA; la demo la leo yo')
    await sheet.getByLabel('Cuéntame tu día').press('Enter')

    const draft = sheet.getByRole('region', { name: 'Borrador del día' })
    await expect(draft.getByText('Hasta las 5:30 pm')).toBeVisible()
    const changes = sheet.getByRole('region', { name: 'Lo que cambia' })
    await expect(changes.getByText('A la vez con Auditoría con IA y Gestor de gastos')).toBeVisible()
    await expect(changes.getByText('Solo para ti')).toBeVisible()
    // Lo que no cabe antes del límite no se ubica después: se pregunta.
    await expect(sheet.getByText('Pulir demo de inglés (5 h) no cabe completa antes de las 5:30 pm. ¿Qué hacemos?')).toBeVisible()
    await expect(changes.getByText('No cupo antes de las 5:30 pm')).toBeVisible()
    // Ningún bloque termina después de las 5:30 pm.
    const times = await changes.locator('.dayplan-card__time').allTextContents()
    const endMin = (t: string) => {
      const m = /– (\d{1,2}):(\d\d) (am|pm)/.exec(t)
      if (!m) return null
      return ((Number(m[1]) % 12) + (m[3] === 'pm' ? 12 : 0)) * 60 + Number(m[2])
    }
    const ends = times.map(endMin).filter((m): m is number => m !== null)
    expect(ends.length).toBe(4)
    for (const end of ends) expect(end).toBeLessThanOrEqual(17 * 60 + 30)

    await settle(page)
    await page.screenshot({ path: test.info().outputPath(`limit-${viewport.width}.png`) })
    await context.close()
  })
}
