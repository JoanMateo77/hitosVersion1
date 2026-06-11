// Edge Function: send-reminders — recordatorios de sesión por Web Push.
// Corre por cron cada 5 minutos (ver docs/notificaciones.md). Para cada
// suscripción: si el usuario tiene una sesión PENDIENTE cuya hora planificada
// cayó en los últimos 10 minutos (en SU zona horaria), envía el push y marca
// reminded_at para no repetir.
//
// Secrets requeridos (Dashboard → Edge Functions → Secrets):
//   VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT (mailto:tu@email), CRON_SECRET
// SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY los inyecta Supabase automáticamente.

import { createClient } from 'npm:@supabase/supabase-js@2'
import webpush from 'npm:web-push@3'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

webpush.setVapidDetails(
  Deno.env.get('VAPID_SUBJECT') ?? 'mailto:hola@example.com',
  Deno.env.get('VAPID_PUBLIC_KEY')!,
  Deno.env.get('VAPID_PRIVATE_KEY')!,
)

/** "HH:MM" y "YYYY-MM-DD" locales para una zona horaria dada. */
function localNow(tz: string): { date: string; hhmm: string } {
  const now = new Date()
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now)
  const hhmm = new Intl.DateTimeFormat('es', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(now)
  return { date, hhmm }
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number)
  return h * 60 + m
}

Deno.serve(async (req) => {
  // Solo el cron (o tú) puede invocarla: secreto compartido en el header.
  if (req.headers.get('x-cron-key') !== Deno.env.get('CRON_SECRET')) {
    return new Response('No autorizado', { status: 401 })
  }

  const { data: subs, error } = await supabase
    .from('push_subscriptions')
    .select('user_id, endpoint, p256dh, auth, profiles!inner(tz)')
  if (error) return new Response(error.message, { status: 500 })

  let sent = 0
  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  for (const [userId, userSubs] of byUser) {
    const tz = (userSubs[0] as { profiles?: { tz?: string } }).profiles?.tz ?? 'UTC'
    const { date, hhmm } = localNow(tz)
    const nowMin = minutesOf(hhmm)

    const { data: sessions } = await supabase
      .from('sessions')
      .select('id, goal_id, planned_time, target_kind, target_value, unit')
      .eq('user_id', userId)
      .eq('session_date', date)
      .eq('status', 'pending')
      .is('reminded_at', null)
      .not('planned_time', 'is', null)

    for (const sess of sessions ?? []) {
      const planned = minutesOf((sess.planned_time as string).slice(0, 5))
      // Ventana: desde la hora planificada hasta 10 min después.
      if (nowMin < planned || nowMin > planned + 10) continue

      const { data: goal } = await supabase
        .from('goals')
        .select('title, status')
        .eq('id', sess.goal_id)
        .single()
      if (!goal || goal.status !== 'active') continue

      const target =
        sess.target_kind === 'time'
          ? `${sess.target_value} min`
          : `${sess.target_value} ${sess.unit ?? ''}`
      const payload = JSON.stringify({
        title: `Tu sesión de ${goal.title}`,
        body: `${target} — es tu momento. Un toque y empezamos.`,
        url: `/sesion/${sess.id}?start=1`,
        tag: `session-${sess.id}`,
      })

      for (const sub of userSubs) {
        try {
          await webpush.sendNotification(
            { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
            payload,
          )
          sent++
        } catch (err) {
          const code = (err as { statusCode?: number }).statusCode
          // 404/410 = suscripción muerta: se limpia sola.
          if (code === 404 || code === 410) {
            await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          }
        }
      }
      await supabase
        .from('sessions')
        .update({ reminded_at: new Date().toISOString() })
        .eq('id', sess.id)
    }
  }

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
