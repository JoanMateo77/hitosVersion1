-- ============================================================================
-- 0020 — Límite diario de IA guardado en la base.
--        Las funciones serverless no comparten memoria: el conteo por persona
--        y día vive aquí. El servidor llama a ai_quota_take / ai_quota_refund
--        con el token de la persona (sin service_role).
-- ============================================================================

create table if not exists public.ai_usage (
  user_id   uuid not null references auth.users (id) on delete cascade,
  day       date not null,
  used      integer not null default 0 check (used >= 0),
  refunded  integer not null default 0 check (refunded >= 0),
  primary key (user_id, day)
);
alter table public.ai_usage enable row level security;

-- La persona puede ver su uso; nadie lo escribe directo (solo las funciones).
drop policy if exists ai_usage_select_own on public.ai_usage;
create policy ai_usage_select_own on public.ai_usage
  for select using (auth.uid() = user_id);

-- Cobra un uso del día (UTC) si no llegó al límite. Atómico: dos pedidos a la
-- vez no pasan el límite. Devuelve el día cobrado, o null si ya no quedan.
create or replace function public.ai_quota_take(p_limit integer)
returns date
language plpgsql
security definer set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_charged date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  if p_limit is null or p_limit < 1 then
    return null;
  end if;
  insert into public.ai_usage as u (user_id, day, used)
  values (auth.uid(), v_day, 1)
  on conflict (user_id, day) do update
    set used = u.used + 1
    where u.used < p_limit
  returning u.day into v_charged;
  return v_charged;
end;
$$;

-- Devuelve un uso cuando la IA no pudo responder. Máximo 10 devoluciones por
-- día: fallar en bucle no puede salir gratis (igual que MAX_DAILY_REFUNDS).
create or replace function public.ai_quota_refund(p_day date)
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  update public.ai_usage
     set used = used - 1,
         refunded = refunded + 1
   where user_id = auth.uid()
     and day = p_day
     and used > 0
     and refunded < 10;
end;
$$;

revoke all on function public.ai_quota_take(integer) from public;
revoke all on function public.ai_quota_refund(date) from public;
revoke all on function public.ai_quota_take(integer) from anon;
revoke all on function public.ai_quota_refund(date) from anon;
grant execute on function public.ai_quota_take(integer) to authenticated;
grant execute on function public.ai_quota_refund(date) to authenticated;
