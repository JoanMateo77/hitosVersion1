import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

/**
 * ¿Están las claves cargadas? La app muestra una pantalla de ayuda en vez de
 * romperse con un error críptico si falta el .env (ver App.tsx).
 */
export const isSupabaseConfigured = Boolean(url && anonKey)

/**
 * Cliente único de Supabase. La sesión se persiste en localStorage, así que el
 * usuario sigue logueado al reabrir la PWA desde la pantalla de inicio.
 *
 * Si faltan las claves usamos placeholders VÁLIDOS (createClient lanzaría con
 * strings vacíos): así la app no crashea al cargar y App.tsx puede mostrar la
 * pantalla de configuración. Sin claves reales nunca se llega a hacer requests.
 */
export const supabase = createClient(
  url || 'http://localhost:54321',
  anonKey || 'placeholder-anon-key',
  {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
)
