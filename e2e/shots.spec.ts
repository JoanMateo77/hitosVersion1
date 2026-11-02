/**
 * Capturas de cada pantalla × ancho × tema contra el backend falso (e2e/mock.ts).
 * Se corre con `npm run shots` (ver e2e/shots.mjs). Una prueba por pantalla.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Page } from '@playwright/test'
import { buildFixtures } from './fixtures/data'
import { mockSession, SESSION_STORAGE_KEY } from './fixtures/session'
import { attachLogging, installMocks, newLog, type PageLog } from './mock'
import { OUT_DIR, PARTS_DIR } from './paths'
import { selectRoutes, THEMES, WIDTHS } from './routes'

const ALLOW_FONTS = process.env.SHOTS_ALLOW_FONTS === '1'
const HEIGHT = 900

/**
 * Espera a que la página quede quieta: las animaciones finitas terminaron (las
 * infinitas, como un pulso, no cuentan) y pasaron dos frames de layout.
 */
async function waitForSettled(page: Page): Promise<void> {
  await page
    .waitForFunction(
      () =>
        document
          .getAnimations()
          .every((a) => a.playState !== 'running' || a.effect?.getComputedTiming().iterations === Infinity),
      null,
      { timeout: 5_000 },
    )
    .catch(() => {}) // una animación colgada no debe impedir la captura
  await page.evaluate(
    () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
  )
}

interface ShotResult extends PageLog {
  file: string
  width: number
  theme: string
  finalUrl: string
  stillLoading: boolean
}

for (const route of selectRoutes(process.env.SHOTS_ROUTES)) {
  test(route.slug, async ({ browser }) => {
    const shots: ShotResult[] = []

    for (const theme of THEMES) {
      for (const width of WIDTHS) {
        const tables = buildFixtures({ onboarded: !route.notOnboarded })
        const context = await browser.newContext({
          viewport: { width, height: HEIGHT },
          colorScheme: theme === 'oscuro' ? 'dark' : 'light',
          serviceWorkers: 'block',
          locale: 'es-CO',
        })
        const page = await context.newPage()
        const log = newLog()
        attachLogging(page, log)
        await installMocks(page, tables, log, { allowFonts: ALLOW_FONTS })

        await page.addInitScript(
          ({ theme, sessionKey, session, draft }) => {
            localStorage.setItem('hito-theme', theme)
            if (session) localStorage.setItem(sessionKey, JSON.stringify(session))
            else localStorage.removeItem(sessionKey)
            // Los datos de prueba ya traen etapas: no hace falta la migración perezosa.
            sessionStorage.setItem('logralo.backfill-v1', '1')
            if (draft) sessionStorage.setItem('logralo.wizard-draft-v2', JSON.stringify(draft))
          },
          {
            theme,
            sessionKey: SESSION_STORAGE_KEY,
            session: route.loggedOut ? null : mockSession(),
            draft: route.wizardDraft ?? null,
          },
        )

        await page.goto(route.url(tables), { waitUntil: 'domcontentloaded' })
        await page.waitForLoadState('networkidle').catch(() => {})
        const stillLoading = await page
          .waitForFunction(() => !document.querySelector('.spinner[role="status"]'), null, { timeout: 15_000 })
          .then(() => false)
          .catch(() => true)
        await page.waitForLoadState('networkidle').catch(() => {})
        await page.evaluate(() => document.fonts.ready.then(() => undefined))
        await waitForSettled(page)
        // La app montó algo en #root (no quedó en blanco por un error de arranque).
        await expect(page.locator('#root')).not.toBeEmpty()
        // Captura "de dispositivo alto": agrandar el viewport al alto del documento
        // deja las barras fijas (tab bar, sidebar) donde van, no a mitad de página.
        const fullHeight = await page.evaluate(() =>
          Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
        )
        if (fullHeight > HEIGHT) {
          await page.setViewportSize({ width, height: Math.min(fullHeight, 12_000) })
          await waitForSettled(page)
        }

        const file = path.join(OUT_DIR, `${route.slug}__${width}__${theme}.png`)
        mkdirSync(path.dirname(file), { recursive: true })
        await page.screenshot({ path: file, fullPage: true, animations: 'disabled', caret: 'hide' })

        shots.push({
          file: path.relative(OUT_DIR, file),
          width,
          theme,
          finalUrl: new URL(page.url()).pathname,
          stillLoading,
          ...log,
        })
        await context.close()
      }
    }

    writeFileSync(
      path.join(PARTS_DIR, `${route.slug}.json`),
      JSON.stringify({ slug: route.slug, path: route.path, shots }, null, 2),
    )

    // Después de escribir el reporte (para poder revisarlo aunque falle):
    // cada captura terminó de cargar y sin excepciones de la app.
    expect(shots).toHaveLength(THEMES.length * WIDTHS.length)
    for (const shot of shots) {
      expect.soft(shot.stillLoading, `${shot.file}: sigue cargando`).toBe(false)
      expect.soft(shot.pageErrors, `${shot.file}: errores de página`).toEqual([])
    }
  })
}
