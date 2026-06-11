-- ============================================================================
-- 0008 — Notificaciones push (Fase 5).
-- ============================================================================

-- 1) Suscripciones Web Push (una fila por dispositivo/navegador)
create table if not exists public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references auth.users (id) on delete cascade,
  endpoint   text not null unique,
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
drop policy if exists push_subscriptions_all_own on public.push_subscriptions;
create policy push_subscriptions_all_own on public.push_subscriptions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- 2) Zona horaria del usuario (para que el recordatorio llegue en SU hora)
alter table public.profiles
  add column if not exists tz text;

-- 3) Evita recordatorios duplicados por sesión
alter table public.sessions
  add column if not exists reminded_at timestamptz;
