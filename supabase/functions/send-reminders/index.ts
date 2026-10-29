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
import { digestBody, digestDue } from './digest.ts'

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

interface PushSub {
  endpoint: string
  p256dh: string
  auth: string
}

/** Envía el payload a cada suscripción y limpia las muertas. Devuelve cuántos push salieron. */
async function sendToSubs(subs: PushSub[], payload: string): Promise<number> {
  let delivered = 0
  for (const sub of subs) {
    try {
      await webpush.sendNotification(
        { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
        payload,
      )
      delivered++
    } catch (err) {
      const code = (err as { statusCode?: number }).statusCode
      // 404/410 = suscripción muerta: se limpia sola.
      if (code === 404 || code === 410) {
        await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
      }
    }
  }
  return delivered
}

/** Lunes=0 … domingo=6 para una fecha local "YYYY-MM-DD". */
function weekdayOf(date: string): number {
  return (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7
}

/** Resumen diario de metas. Tolera que la migración 0017 no esté aplicada. */
async function sendDigest(userId: string, subs: PushSub[], date: string, nowMin: number): Promise<number> {
  const { data: prof, error } = await supabase
    .from('profiles')
    .select('daily_digest_time, daily_digest_sent_on')
    .eq('id', userId)
    .maybeSingle()
  if (error) {
    // 42703 / PGRST204 = columna inexistente (sin migración 0017): se omite en silencio.
    if (error.code !== '42703' && error.code !== 'PGRST204') {
      console.error('digest: no se pudo leer el perfil', userId, error.message)
    }
    return 0
  }
  if (!prof) return 0
  const digestTime = prof.daily_digest_time as string | null
  const sentOn = prof.daily_digest_sent_on as string | null
  if (!digestDue(nowMin, digestTime, sentOn, date)) return 0

  const { data: goals, error: goalsErr } = await supabase
    .from('goals')
    .select('id, title')
    .eq('user_id', userId)
    .eq('status', 'active')
    .order('created_at', { ascending: false })
  if (goalsErr) {
    console.error('digest: error leyendo metas', userId, goalsErr.message)
    return 0
  }
  if (!goals || goals.length === 0) return 0
  const goalIds = goals.map((g) => g.id as string)

  const { data: blocks, error: blocksErr } = await supabase
    .from('goal_schedule')
    .select('id')
    .eq('user_id', userId)
    .in('goal_id', goalIds)
    .eq('weekday', weekdayOf(date))
  if (blocksErr) {
    console.error('digest: error leyendo horario', userId, blocksErr.message)
    return 0
  }
  const { count: skipped, error: skippedErr } = await supabase
    .from('sessions')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
    .eq('session_date', date)
    .eq('status', 'skipped')
    .in('goal_id', goalIds)
  if (skippedErr) {
    console.error('digest: error leyendo sesiones', userId, skippedErr.message)
    return 0
  }
  const sessionsToday = Math.max(0, (blocks?.length ?? 0) - (skipped ?? 0))

  // Se marca como enviado ANTES de enviar: el cron corre cada 5 min y la ventana es de
  // 10, así que si el update fallara tras enviar, el usuario recibiría el push repetido.
  // Trade-off: si el envío falla, no se reintenta hoy (mejor perder un aviso que duplicarlo).
  const { error: markErr } = await supabase
    .from('profiles')
    .update({ daily_digest_sent_on: date })
    .eq('id', userId)
  if (markErr) {
    console.error('digest: no se pudo marcar como enviado', userId, markErr.message)
    return 0
  }

  const { title, body } = digestBody(goals.map((g) => g.title as string), sessionsToday)
  return sendToSubs(subs, JSON.stringify({ title, body, url: '/', tag: 'daily-digest' }))
}

interface SessionRow {
  id: string
  goal_id: string
  planned_time: string
  target_kind: string
  target_value: number
  unit: string | null
}

async function remindSession(
  sess: SessionRow,
  userSubs: PushSub[],
): Promise<number> {
  const { data: goal } = await supabase
    .from('goals')
    .select('title, status')
    .eq('id', sess.goal_id)
    .single()
  if (goal?.status !== 'active') return 0

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

  const count = await sendToSubs(userSubs, payload)
  await supabase
    .from('sessions')
    .update({ reminded_at: new Date().toISOString() })
    .eq('id', sess.id)
  return count
}

async function remindUser(userId: string, userSubs: PushSub[]): Promise<number> {
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

  const due = (sessions ?? []).filter((sess) => {
    const planned = minutesOf((sess.planned_time as string).slice(0, 5))
    // Ventana: desde la hora planificada hasta 10 min después.
    return nowMin >= planned && nowMin <= planned + 10
  })
  const counts = await Promise.all(due.map((sess) => remindSession(sess, userSubs)))
  const sent = counts.reduce((acc, n) => acc + n, 0)

  return sent + (await sendDigest(userId, userSubs, date, nowMin))
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

  const byUser = new Map<string, typeof subs>()
  for (const s of subs ?? []) {
    const list = byUser.get(s.user_id) ?? []
    list.push(s)
    byUser.set(s.user_id, list)
  }

  // Cada usuario es independiente: se procesan en paralelo. Dentro de un usuario, el
  // digest se envía después de los recordatorios de sesión (y marca-antes-de-enviar).
  const perUser = await Promise.all(
    [...byUser].map(([userId, userSubs]) => remindUser(userId, userSubs)),
  )
  const sent = perUser.reduce((acc, n) => acc + n, 0)

  return new Response(JSON.stringify({ sent }), {
    headers: { 'Content-Type': 'application/json' },
  })
})
