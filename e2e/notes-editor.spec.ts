/**
 * Escribir notas: captura rápida, lista con teclado, marcar desde la tarjeta,
 * deshacer y guardado automático. Supabase es falso (e2e/mock.ts).
 */
import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { installMocks, newLog } from './mock'

const LIST_NOTE = 'Frases para reuniones'
const OPEN_ITEM = 'What would success look like?'

async function open(page: Page, path = '/notas') {
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto(path)
}

interface Sent {
  method: string
  body: Record<string, unknown> | null
}

/** Cuerpo JSON de la petición (un insert llega como arreglo de una fila). */
function bodyOf(raw: string | null): Record<string, unknown> | null {
  if (!raw) return null
  try {
    const parsed: unknown = JSON.parse(raw)
    return (Array.isArray(parsed) ? parsed[0] : parsed) as Record<string, unknown> | null
  } catch {
    return null
  }
}

/** Escrituras a la tabla notes (POST/PATCH/DELETE), en orden. */
function noteWrites(page: Page): Sent[] {
  const sent: Sent[] = []
  page.on('request', (req) => {
    if (new URL(req.url()).pathname !== '/rest/v1/notes' || req.method() === 'GET') return
    sent.push({ method: req.method(), body: bodyOf(req.postData()) })
  })
  return sent
}

const itemTexts = (body: Record<string, unknown> | null) =>
  ((body?.items as { text: string; done: boolean }[] | null) ?? []).map((i) => `${i.done ? '✓' : '·'}${i.text}`)

async function paste(target: Locator, text: string) {
  await target.evaluate((el, value) => {
    const data = new DataTransfer()
    data.setData('text/plain', value)
    el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }))
  }, text)
}

for (const viewport of [
  { width: 390, height: 800 },
  { width: 1280, height: 800 },
]) {
  test(`a note from the capture bar gets focus and saves itself while typing (${viewport.width}px)`, async ({
    browser,
  }) => {
    const page = await browser.newPage({ viewport })
    const writes = noteWrites(page)
    await open(page)

    await page.getByRole('button', { name: 'Nueva nota' }).click()
    const dialog = page.getByRole('dialog')
    const body = dialog.getByRole('textbox', { name: 'Nota' })
    await expect(body).toBeFocused()
    await body.pressSequentially('Llamar al banco por la tarjeta')

    // Sin cerrar: el guardado automático crea la nota.
    await expect.poll(() => writes.filter((w) => w.method === 'POST').length).toBe(1)
    await expect(dialog.getByText('Guardado')).toBeVisible()

    await dialog.getByRole('button', { name: 'Listo' }).click()
    await expect(dialog).toBeHidden()
    await expect(page.getByText('Llamar al banco por la tarjeta')).toBeVisible()
    // Cerrar sin cambios nuevos no vuelve a escribir.
    expect(writes.filter((w) => w.method === 'POST')).toHaveLength(1)
    await page.close()
  })
}

test('a list is written with the keyboard: Enter, Backspace and paste', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await open(page)

  await page.getByRole('button', { name: 'Nueva lista' }).click()
  const dialog = page.getByRole('dialog')
  const add = dialog.getByRole('textbox', { name: 'Agregar elemento' })
  await expect(add).toBeFocused()
  await add.pressSequentially('pan')
  await add.press('Enter')
  await expect(add).toBeFocused()
  await add.pressSequentially('leche')
  await add.press('Enter')

  // Enter al final de un elemento abre uno nuevo debajo; Backspace vacío lo quita.
  const first = dialog.getByRole('textbox', { name: 'Elemento 1' })
  await first.click()
  await first.press('End')
  await first.press('Enter')
  const inserted = dialog.getByRole('textbox', { name: 'Elemento 2' })
  await expect(inserted).toBeFocused()
  await expect(inserted).toHaveValue('')
  await inserted.press('Backspace')
  await expect(first).toBeFocused()
  await expect(dialog.getByRole('textbox', { name: 'Elemento 2' })).toHaveValue('leche')

  // Pegar varias líneas crea un elemento por línea.
  await paste(add, 'huevos\narroz')
  await expect(dialog.getByRole('textbox', { name: 'Elemento 4' })).toHaveValue('arroz')

  // Lo marcado baja a "Marcados".
  await dialog.getByRole('button', { name: 'Marcar: pan' }).click()
  await expect(dialog.getByRole('button', { name: 'Marcados (1)' })).toBeVisible()

  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect(dialog).toBeHidden()
  await expect.poll(() => itemTexts(writes.at(-1)?.body ?? null)).toEqual(['✓pan', '·leche', '·huevos', '·arroz'])
  await page.close()
})

test('list items can be checked from the card without opening the note', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await open(page, '/notas?vista=goals')

  const card = page.locator('.note-card', { hasText: LIST_NOTE })
  await expect(card.getByRole('img', { name: '2 de 3 hechos' })).toBeVisible()
  await card.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` }).click()

  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(card.getByRole('img', { name: '3 de 3 hechos' })).toBeVisible()
  await expect.poll(() => writes.filter((w) => w.method === 'PATCH').length).toBe(1)
  expect(itemTexts(writes[0].body)).toContain(`✓${OPEN_ITEM}`)
  await page.close()
})

test('deleting a note asks nothing and can be undone', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await open(page, '/notas?vista=areas')

  const title = 'Cosas para preguntarle a mamá'
  await page.getByText(title).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Más' }).click()
  await dialog.getByRole('button', { name: 'Eliminar nota' }).click()
  await expect(dialog).toBeHidden()
  await expect(page.getByText(title)).toHaveCount(0)

  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(page.getByText(title)).toBeVisible()
  const deleted = writes.find((w) => w.method === 'DELETE')
  const restored = writes.find((w) => w.method === 'POST')
  expect(deleted).toBeTruthy()
  expect(restored?.body).toMatchObject({ title, place: 'area', area: 'relaciones' })
  expect(restored?.body?.id).toEqual(expect.any(String))
  await page.close()
})

test('turning a list into text and back keeps what was checked', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?vista=goals')

  await page.locator('.note-card', { hasText: LIST_NOTE }).getByRole('button', { name: LIST_NOTE }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: 'Lista' }).click()
  await expect(dialog.getByRole('textbox', { name: 'Nota' })).toHaveValue(/^✓ Could you walk me through…\n/)
  await dialog.getByRole('button', { name: 'Lista' }).click()
  await expect(dialog.getByRole('button', { name: 'Desmarcar: Could you walk me through…' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` })).toBeVisible()
  await page.close()
})

test('items are reordered from the handle with the keyboard', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const writes = noteWrites(page)
  await open(page, '/notas?vista=goals')

  await page.locator('.note-card', { hasText: LIST_NOTE }).getByRole('button', { name: LIST_NOTE }).click()
  const dialog = page.getByRole('dialog')
  const add = dialog.getByRole('textbox', { name: 'Agregar elemento' })
  await add.fill('Can we park this for now?')
  await add.press('Enter')

  const handle = dialog.getByRole('button', { name: `Mover: ${OPEN_ITEM}` })
  await handle.focus()
  await handle.press('ArrowDown')
  await expect(handle).toBeFocused()

  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect.poll(() => itemTexts(writes.at(-1)?.body ?? null).slice(-2)).toEqual([
    '·Can we park this for now?',
    `·${OPEN_ITEM}`,
  ])
  await page.close()
})

test('the home-screen shortcut opens a new list once', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?nueva=lista')

  const dialog = page.getByRole('dialog')
  await expect(dialog.getByRole('textbox', { name: 'Agregar elemento' })).toBeFocused()
  await expect(page).toHaveURL(/\/notas$/)
  await page.close()
})

test('a new note emptied after saving itself is discarded on close', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await open(page)

  await page.getByRole('button', { name: 'Nueva nota' }).click()
  const dialog = page.getByRole('dialog')
  const body = dialog.getByRole('textbox', { name: 'Nota' })
  await body.pressSequentially('borrador')
  await expect.poll(() => writes.some((w) => w.method === 'POST')).toBe(true)
  await body.fill('')
  await dialog.getByRole('button', { name: 'Listo' }).click()

  await expect.poll(() => writes.some((w) => w.method === 'DELETE')).toBe(true)
  await expect(page.getByText('borrador')).toHaveCount(0)
  await page.close()
})

test('Notas says so when the notes table is missing', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await installMocks(page, buildFixtures({ onboarded: true }), newLog())
  await page.route('**/rest/v1/notes**', (route) =>
    route.request().method() === 'GET'
      ? route.fulfill({
          status: 404,
          contentType: 'application/json',
          headers: { 'access-control-allow-origin': '*' },
          body: JSON.stringify({ code: 'PGRST205', message: "Could not find the table 'public.notes'" }),
        })
      : route.fallback(),
  )
  await page.addInitScript(
    ({ key, session }) => {
      localStorage.setItem(key, JSON.stringify(session))
      sessionStorage.setItem('logralo.backfill-v1', '1')
    },
    { key: SESSION_STORAGE_KEY, session: mockSession() },
  )
  await page.goto('/notas')
  await expect(page.getByText('Falta aplicar la migración 0017 para usar Notas.')).toBeVisible()
  await page.close()
})

test('an item dragged by its handle changes place, and sideways it gets indented', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  const writes = noteWrites(page)
  await open(page)

  await page.getByRole('button', { name: 'Nueva lista' }).click()
  const dialog = page.getByRole('dialog')
  await paste(dialog.getByRole('textbox', { name: 'Agregar elemento' }), 'uno\ndos\ntres')

  // Que las tres filas estén en pantalla (la hoja se desplaza por dentro).
  await dialog.getByRole('textbox', { name: 'Agregar elemento' }).scrollIntoViewIfNeeded()
  const grip = async (name: string) => (await dialog.getByRole('button', { name: `Mover: ${name}` }).boundingBox())!
  const from = await grip('uno')
  const to = await grip('tres')
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down()
  await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 4, { steps: 8 })
  await page.mouse.up()
  await expect(dialog.getByRole('textbox', { name: 'Elemento 3' })).toHaveValue('uno')

  const dos = await grip('dos')
  const tres = await grip('tres')
  await page.mouse.move(tres.x + tres.width / 2, tres.y + tres.height / 2)
  await page.mouse.down()
  await page.mouse.move(tres.x + tres.width / 2 + 40, tres.y + tres.height / 2, { steps: 6 })
  await page.mouse.up()
  expect(dos.y).toBeLessThan(tres.y)

  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect.poll(() => (writes.at(-1)?.body?.items as unknown[] | undefined) ?? []).toEqual([
    { text: 'dos', done: false },
    { text: 'tres', done: false, indented: true },
    { text: 'uno', done: false },
  ])
  await page.close()
})

test('removing an item can be undone while the note is open', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?vista=goals')

  await page.locator('.note-card', { hasText: LIST_NOTE }).getByRole('button', { name: LIST_NOTE }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: `Quitar: ${OPEN_ITEM}` }).click()
  await expect(dialog.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` })).toHaveCount(0)
  await page.getByRole('button', { name: 'Deshacer' }).click()
  await expect(dialog.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` })).toBeVisible()
  await page.close()
})

test('after a failed save works again, reopening shows the newest text, not the old rescue', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?vista=ideas')

  let failing = true
  await page.route('**/rest/v1/notes**', (route) =>
    failing && route.request().method() === 'PATCH'
      ? route.fulfill({ status: 503, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: '{"message":"offline"}' })
      : route.fallback(),
  )
  await page.getByText('Idea: un recordatorio').click()
  const dialog = page.getByRole('dialog')
  const body = dialog.getByRole('textbox', { name: 'Nota' })
  await body.press('End')
  await body.pressSequentially(' uno')
  await expect(dialog.getByText('Sin guardar')).toBeVisible()

  failing = false
  await body.pressSequentially(' dos')
  await expect(dialog.getByText('Guardado')).toBeVisible()
  await dialog.getByRole('button', { name: 'Listo' }).click()
  await expect(dialog).toBeHidden()

  await page.getByText('Idea: un recordatorio').click()
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Nota' })).toHaveValue(/ uno dos/)
  await page.close()
})

test('deleting a new note while its first save is in flight does not bring it back', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await open(page)
  await page.route('**/rest/v1/notes**', async (route) => {
    if (route.request().method() === 'POST') await new Promise((r) => setTimeout(r, 1500))
    await route.fallback()
  })

  await page.getByRole('button', { name: 'Nueva nota' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nota' }).pressSequentially('nota fugaz')
  await expect.poll(() => writes.some((w) => w.method === 'POST')).toBe(true)
  await dialog.getByRole('button', { name: 'Más' }).click()
  await dialog.getByRole('button', { name: 'Eliminar nota' }).click()

  await expect(dialog).toBeHidden()
  await expect.poll(() => writes.some((w) => w.method === 'DELETE')).toBe(true)
  await page.waitForTimeout(300)
  await expect(page.getByText('nota fugaz')).toHaveCount(0)
  await page.close()
})

test('checking with the keyboard keeps focus on the checkbox when it moves to Marcados', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?vista=goals')
  await page.locator('.note-card', { hasText: LIST_NOTE }).getByRole('button', { name: LIST_NOTE }).click()
  const dialog = page.getByRole('dialog')

  // Numerados como se ven: el único sin marcar es el primero, aunque se guardó tercero.
  await expect(dialog.getByRole('textbox', { name: 'Elemento 1' })).toHaveValue(OPEN_ITEM)
  await dialog.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` }).focus()
  await page.keyboard.press('Space')
  await expect(dialog.getByRole('button', { name: 'Marcados (3)' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: `Desmarcar: ${OPEN_ITEM}` })).toBeFocused()

  await page.keyboard.press('Space')
  await expect(dialog.getByRole('button', { name: `Marcar: ${OPEN_ITEM}` })).toBeFocused()
  await page.close()
})

test('a checked parent waits above with its children, and Backspace still merges while it waits', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } })
  await open(page)
  await page.getByRole('button', { name: 'Nueva lista' }).click()
  const dialog = page.getByRole('dialog')
  await paste(dialog.getByRole('textbox', { name: 'Agregar elemento' }), 'padre\nhijo\notro')
  await dialog.getByRole('textbox', { name: 'Elemento 2' }).focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Tab')

  await dialog.getByRole('button', { name: 'Marcar: padre' }).click()
  // Padre e hijo siguen arriba un instante (nada en Marcados todavía).
  await expect(dialog.getByRole('button', { name: 'Desmarcar: hijo' })).toBeVisible()
  await expect(dialog.getByRole('button', { name: /^Marcados/ })).toHaveCount(0)

  await dialog.getByRole('button', { name: 'Marcar: otro' }).click()
  const otro = dialog.getByRole('textbox', { name: 'Elemento 3' })
  await otro.focus()
  await page.keyboard.press('Home')
  await page.keyboard.press('Backspace')
  await expect(dialog.getByRole('textbox', { name: 'Elemento 2' })).toHaveValue('hijootro')
  await page.close()
})

test('the item Undo goes away when the list becomes text', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page, '/notas?vista=goals')
  await page.locator('.note-card', { hasText: LIST_NOTE }).getByRole('button', { name: LIST_NOTE }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('button', { name: `Quitar: ${OPEN_ITEM}` }).click()
  await expect(page.getByRole('button', { name: 'Deshacer' })).toBeVisible()
  await dialog.getByRole('button', { name: 'Lista' }).click()
  await expect(page.getByRole('button', { name: 'Deshacer' })).toHaveCount(0)
  await page.close()
})

test('a shortcut also opens the sheet when Notas is already on screen', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page)
  await expect(page.getByRole('button', { name: 'Nueva nota' })).toBeVisible()
  await page.evaluate(() => {
    history.pushState({}, '', '/notas?nueva=nota')
    dispatchEvent(new PopStateEvent('popstate'))
  })
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Nota' })).toBeVisible()
  await expect(page).toHaveURL(/\/notas$/)
  await page.close()
})

test('undoing a delete after closing does not mark another card as new', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  await open(page)

  await page.getByRole('button', { name: 'Nueva nota' }).click()
  const dialog = page.getByRole('dialog')
  await dialog.getByRole('textbox', { name: 'Nota' }).pressSequentially('recuperable')
  await expect(dialog.getByText('Guardado')).toBeVisible()
  await dialog.getByRole('button', { name: 'Más' }).click()
  await dialog.getByRole('button', { name: 'Eliminar nota' }).click()
  await expect(dialog).toBeHidden()
  await page.getByRole('button', { name: 'Deshacer' }).click()
  const card = page.locator('.note-card', { hasText: 'recuperable' })
  await expect(card).toBeVisible()

  // Abrir y cerrar otra nota no hace "entrar" la recuperada como nueva.
  await card.getByRole('button', { name: 'recuperable' }).click()
  await page.getByRole('dialog').getByRole('button', { name: 'Listo' }).click()
  await expect(page.getByRole('dialog')).toBeHidden()
  await expect(card).not.toHaveClass(/note-card--fresh/)
  await page.close()
})

test('a rescued draft of a new note is not saved just by opening the sheet', async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 390, height: 800 } })
  const writes = noteWrites(page)
  await page.addInitScript(() => {
    sessionStorage.setItem(
      'logralo.note-draft-v1',
      JSON.stringify({ noteId: null, goalId: null, title: '', body: 'texto rescatado', items: null }),
    )
  })
  await open(page)
  await page.getByRole('button', { name: 'Nueva nota' }).click()
  await expect(page.getByRole('dialog').getByRole('textbox', { name: 'Nota' })).toHaveValue('texto rescatado')
  await page.waitForTimeout(1200)
  expect(writes.filter((w) => w.method === 'POST')).toHaveLength(0)
  await page.close()
})
