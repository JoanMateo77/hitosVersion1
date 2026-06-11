import { supabase } from '@/lib/supabase'

/**
 * Recordatorios push (Fase 5): suscripción del navegador + fila en
 * push_subscriptions. El envío lo hace la Edge Function `send-reminders`
 * (cron cada 5 min) usando la clave VAPID privada del servidor.
 *
 * Limitación conocida: en iPhone solo funciona con la PWA instalada en la
 * pantalla de inicio (iOS 16.4+).
 */

const PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY as string | undefined

export function pushSupported(): boolean {
  return (
    Boolean(PUBLIC_KEY) &&
    'serviceWorker' in navigator &&
    'PushManager' in window &&
    'Notification' in window
  )
}

function urlBase64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4)
  const raw = atob((base64 + padding).replace(/-/g, '+').replace(/_/g, '/'))
  const arr = new Uint8Array(new ArrayBuffer(raw.length))
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i)
  return arr
}

/** ¿Este navegador ya está suscripto? */
export async function getPushState(): Promise<'on' | 'off' | 'blocked' | 'unsupported'> {
  if (!pushSupported()) return 'unsupported'
  if (Notification.permission === 'denied') return 'blocked'
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  return sub ? 'on' : 'off'
}

/** Pide permiso, suscribe el navegador y guarda la suscripción. */
export async function enablePush(userId: string): Promise<void> {
  if (!pushSupported() || !PUBLIC_KEY) throw new Error('Este navegador no soporta recordatorios.')
  const permission = await Notification.requestPermission()
  if (permission !== 'granted') throw new Error('Permiso de notificaciones rechazado.')
  const reg = await navigator.serviceWorker.ready
  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_KEY),
    }))
  const json = sub.toJSON()
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
    throw new Error('No se pudo registrar la suscripción.')
  }
  const { error } = await supabase.from('push_subscriptions').upsert(
    {
      user_id: userId,
      endpoint: json.endpoint,
      p256dh: json.keys.p256dh,
      auth: json.keys.auth,
    },
    { onConflict: 'endpoint' },
  )
  if (error) throw new Error(error.message)
}

/** Borra la suscripción de este navegador (local + servidor). */
export async function disablePush(): Promise<void> {
  if (!pushSupported()) return
  const reg = await navigator.serviceWorker.ready
  const sub = await reg.pushManager.getSubscription()
  if (!sub) return
  const endpoint = sub.endpoint
  await sub.unsubscribe().catch(() => {})
  await supabase.from('push_subscriptions').delete().eq('endpoint', endpoint)
}

/** Mantiene la zona horaria del perfil al día (el recordatorio llega en TU hora). */
export async function syncTimezone(userId: string): Promise<void> {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone
    if (!tz) return
    await supabase.from('profiles').update({ tz }).eq('id', userId).neq('tz', tz)
  } catch {
    /* no crítico */
  }
}
