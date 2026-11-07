-- ============================================================================
-- 0021 — Devoluciones de cuota de IA con comprobante.
--        Antes cualquiera podía llamar a ai_quota_refund por su cuenta y
--        devolverse usos sin que la IA hubiera fallado. Ahora cada cobro crea
--        un comprobante con id aleatorio que solo conoce el servidor, y la
--        devolución lo exige (una vez, dentro de 10 minutos).
-- ============================================================================

create table if not exists public.ai_quota_charges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users (id) on delete cascade,
  day         date not null,
  refunded    boolean not null default false,
  created_at  timestamptz not null default now()
);
-- Sin políticas: nadie lee ni escribe la tabla directo, solo las funciones.
alter table public.ai_quota_charges enable row level security;
create index if not exists ai_quota_charges_user_idx on public.ai_quota_charges (user_id, created_at);

-- Las firmas cambian: se reemplazan las de 0020.
drop function if exists public.ai_quota_take(integer);
drop function if exists public.ai_quota_refund(date);

-- Cobra un uso del día (UTC) si no llegó al límite (atómico) y devuelve el id
-- del comprobante, o null si ya no quedan usos.
create or replace function public.ai_quota_take(p_limit integer)
returns uuid
language plpgsql
security definer set search_path = public
as $$
declare
  v_day date := (now() at time zone 'utc')::date;
  v_charged date;
  v_charge uuid;
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
  if v_charged is null then
    return null;
  end if;
  -- Los comprobantes viejos ya no se pueden devolver: se limpian.
  delete from public.ai_quota_charges
   where user_id = auth.uid() and created_at < now() - interval '2 days';
  insert into public.ai_quota_charges (user_id, day)
  values (auth.uid(), v_charged)
  returning id into v_charge;
  return v_charge;
end;
$$;

-- Devuelve el uso de UN cobro propio, una sola vez, dentro de 10 minutos y con
-- máximo 10 devoluciones por día (igual que MAX_DAILY_REFUNDS).
create or replace function public.ai_quota_refund(p_charge uuid)
returns void
language plpgsql
security definer set search_path = public
as $$
declare
  v_day date;
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  update public.ai_quota_charges
     set refunded = true
   where id = p_charge
     and user_id = auth.uid()
     and not refunded
     and created_at > now() - interval '10 minutes'
     and exists (
       select 1 from public.ai_usage a
        where a.user_id = auth.uid() and a.day = ai_quota_charges.day
          and a.used > 0 and a.refunded < 10
     )
  returning day into v_day;
  if v_day is null then
    return;
  end if;
  update public.ai_usage
     set used = used - 1,
         refunded = refunded + 1
   where user_id = auth.uid() and day = v_day;
end;
$$;

revoke all on function public.ai_quota_take(integer) from public, anon;
revoke all on function public.ai_quota_refund(uuid) from public, anon;
grant execute on function public.ai_quota_take(integer) to authenticated;
grant execute on function public.ai_quota_refund(uuid) to authenticated;
