import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        id: '/',
        name: 'Hito — metas con guía',
        short_name: 'Hito',
        description: 'Definí metas, recibí un plan del día y avanzá un paso por vez.',
        lang: 'es',
        dir: 'ltr',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        display_override: ['window-controls-overlay', 'standalone', 'minimal-ui'],
        orientation: 'portrait',
        start_url: '/',
        scope: '/',
        categories: ['productivity', 'lifestyle'],
        icons: [
          { src: 'icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icon-512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'icon-512.png',
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
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Nueva meta',
            short_name: 'Meta',
            description: 'Crear una meta nueva',
            url: '/meta/nueva',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
          {
            name: 'Tu agenda',
            short_name: 'Agenda',
            description: 'Abrir el calendario',
            url: '/calendario',
            icons: [{ src: 'icon-192.png', sizes: '192x192' }],
          },
        ],
      },
      workbox: {
        // La API de Supabase nunca se cachea; el shell de la app sí.
        navigateFallbackDenylist: [/^\/api/],
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
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
