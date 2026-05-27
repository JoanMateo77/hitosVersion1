import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'

// Config propia de los tests (no carga los plugins de la app, p. ej. PWA).
// La lógica de dominio es pura, así que corre en entorno Node sin DOM ni red.
export default defineConfig({
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
})
