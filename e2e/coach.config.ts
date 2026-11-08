import { defineConfig } from '@playwright/test'
import { MOCK_SUPABASE_URL } from './fixtures/session'

/**
 * Pruebas de interacción del coach (npm run e2e:coach) contra el backend falso
 * de e2e/mock.ts. Vite propio en otro puerto que las capturas: no se pisan.
 */
const PORT = Number(process.env.COACH_E2E_PORT) || 5198

export default defineConfig({
  testDir: '.',
  testMatch: ['coach-chat.spec.ts', 'focus.spec.ts', 'day-planner.spec.ts', 'notes-checklist.spec.ts', 'ia-tour.spec.ts'],
  outputDir: '../test-results/coach-e2e',
  retries: 0,
  timeout: 90_000,
  reporter: [['list']],
  use: { baseURL: `http://localhost:${PORT}`, browserName: 'chromium', serviceWorkers: 'block', locale: 'es-CO' },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: '..',
    env: { VITE_SUPABASE_URL: MOCK_SUPABASE_URL, VITE_SUPABASE_ANON_KEY: 'mock-anon-key' },
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
