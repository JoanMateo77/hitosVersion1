import { defineConfig } from '@playwright/test'
import { MOCK_SUPABASE_URL } from './fixtures/session'
import { LABEL, PORT } from './paths'

/**
 * Arnés de capturas (npm run shots). Levanta SU PROPIO Vite en 5199 con un
 * Supabase falso: el proceso pisa las VITE_SUPABASE_* del .env, así el bundle
 * nunca apunta al proyecto real. Nunca reutiliza el server del usuario (5173).
 */
export default defineConfig({
  testDir: '.',
  testMatch: 'shots.spec.ts',
  // Por etiqueta: dos tandas simultáneas no se borran la salida una a otra.
  outputDir: `../test-results/shots-${LABEL}`,
  fullyParallel: true,
  workers: 2,
  retries: 0,
  timeout: 180_000,
  reporter: [['list']],
  globalSetup: './shots.setup.ts',
  globalTeardown: './shots.teardown.ts',
  use: {
    baseURL: `http://localhost:${PORT}`,
    browserName: 'chromium',
    serviceWorkers: 'block',
    locale: 'es-CO',
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
    cwd: '..',
    env: {
      VITE_SUPABASE_URL: MOCK_SUPABASE_URL,
      VITE_SUPABASE_ANON_KEY: 'mock-anon-key',
    },
    stdout: 'ignore',
    stderr: 'pipe',
  },
})
