# Notificaciones push (Fase 5) — guía de despliegue

El cliente ya está listo (toggle en Perfil → Recordatorios; service worker con
handlers de push; suscripciones en `push_subscriptions`). Falta el lado servidor,
que vive en TU Supabase. Son 4 pasos, una sola vez.

## 1. Migración 0008

SQL Editor → pegar `supabase/migrations/0008_push.sql` → Run.

## 2. Desplegar la Edge Function

Dashboard → **Edge Functions** → *Deploy a new function* → nombre: `send-reminders`
→ pegar el contenido de `supabase/functions/send-reminders/index.ts` → Deploy.

> En *Details* de la función, desactiva **Verify JWT** (la protege el CRON_SECRET).

## 3. Secrets de la función

Edge Functions → **Secrets** → agregar:

| Secret | Valor |
|---|---|
| `VAPID_PUBLIC_KEY` | `BPtKL0EDHswTkyiOKfHrgKdaWRSfMjAgkz9y8T981ymfE2y91IWWNcpMLIvWaWjqsNM5EIdfgfUG9Z2NwLWWT84` |
| `VAPID_PRIVATE_KEY` | (la clave privada que te pasó Claude en el chat — guárdala también en tu gestor de contraseñas; NUNCA va al repo) |
| `VAPID_SUBJECT` | `mailto:joanmateo1102@gmail.com` |
| `CRON_SECRET` | un texto largo aleatorio que inventes (es la llave del cron) |

## 4. Programar el cron (cada 5 minutos)

SQL Editor → Run (reemplaza `TU_CRON_SECRET` por el del paso 3):

```sql
create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'logralo-send-reminders',
  '*/5 * * * *',
  $$
  select net.http_post(
    url := 'https://nrihktdrzpjzhaupsbnb.supabase.co/functions/v1/send-reminders',
    headers := '{"x-cron-key": "TU_CRON_SECRET"}'::jsonb
  )
  $$
);
```

## Probar

1. En la app (instalada como PWA en el teléfono, o Chrome/Edge de escritorio):
   Perfil → Recordatorios → **Activar** → aceptar el permiso.
2. Ponle a una sesión de hoy una hora 2-3 minutos en el futuro (Agenda → tocar
   la sesión → fijar hora).
3. Cierra la app. En ≤5 minutos llega: *"Tu sesión de {meta} — 25 min, es tu
   momento"*. Tocarla abre el cronómetro directo.

## Limitaciones conocidas

- **iPhone**: solo con la PWA instalada en pantalla de inicio (iOS 16.4+).
- La ventana de envío es de 10 min tras la hora planificada; el cron corre cada 5.
- Backlog (cuando se quiera): aviso de fin de cronómetro y rescate de racha nocturno.
