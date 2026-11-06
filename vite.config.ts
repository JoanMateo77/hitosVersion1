import type { IncomingMessage, ServerResponse } from 'node:http'
import { fileURLToPath, URL } from 'node:url'
import { defineConfig, loadEnv, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { createPlanMetaHandler } from './src/server/planMetaApp'

/**
 * En local monta POST /api/plan-meta con el mismo handler que la función de
 * Vercel, así no hace falta `vercel dev`. Lee .env/.env.local SIN filtrar por
 * prefijo (solo en este proceso de Node; el bundle sigue viendo solo VITE_*).
 */
/** Pasa un pedido de Node al handler Web (Request → Response) y escribe la respuesta. */
async function forward(
  handler: (request: Request) => Promise<Response>,
  req: IncomingMessage & { originalUrl?: string },
  res: ServerResponse,
  body: Uint8Array<ArrayBuffer>,
): Promise<void> {
  try {
    const response = await handler(
      new Request(`http://localhost${req.originalUrl ?? '/api/plan-meta'}`, {
        method: req.method,
        headers: req.headers as Record<string, string>,
        body: req.method === 'POST' ? body : undefined,
      }),
    )
    res.statusCode = response.status
    response.headers.forEach((value, key) => res.setHeader(key, value))
    res.end(await response.text())
  } catch {
    res.statusCode = 500
    res.end()
  }
}

function localApi(): Plugin {
  return {
    name: 'local-api',
    apply: 'serve',
    configureServer(server) {
      const env = loadEnv(server.config.mode, process.cwd(), '')
      const handler = createPlanMetaHandler(env)
      server.middlewares.use('/api/plan-meta', (req, res) => {
        const chunks: Buffer[] = []
        req.on('data', (c: Buffer) => chunks.push(c))
        req.on('end', () => void forward(handler, req, res, Buffer.concat(chunks)))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    localApi(),
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Lógralo — metas con compromiso',
        short_name: 'Lógralo',
        description: 'Lógralo: metas con compromiso real — sesiones, etapas y progreso que no se inventa.',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#f2f2f7',
        background_color: '#f2f2f7',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: 'icon-192.png?v=5', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png?v=5', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png?v=5',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
        // Shortcuts: long-press del ícono en Android. iOS los ignora pero no rompe.
        shortcuts: [
          {
            name: 'Plan de hoy',
            short_name: 'Hoy',
            description: 'Ver el plan de hoy',
            url: '/',
            icons: [{ src: 'icon-192.png?v=5', sizes: '192x192' }],
          },
          {
            name: 'Nueva meta',
            short_name: 'Meta',
            description: 'Crear una meta nueva',
            url: '/meta/nueva',
            icons: [{ src: 'icon-192.png?v=5', sizes: '192x192' }],
          },
          {
            name: 'Tu agenda',
            short_name: 'Agenda',
            description: 'Abrir el calendario',
            url: '/calendario',
            icons: [{ src: 'icon-192.png?v=5', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // La API de Supabase nunca se cachea; el shell de la app sí.
        // /e/ son páginas sueltas (encuestas) fuera de la app: ni fallback ni precache.
        navigateFallbackDenylist: [/^\/api/, /^\/e\//],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        globIgnores: ['e/**'],
        // Push: los handlers viven en un script aparte que convive con workbox.
        importScripts: ['push-sw.js'],
      },
    }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // host: true expone el server en la red local para abrirlo desde el celular.
    host: true,
    port: 5173,
  },
})
