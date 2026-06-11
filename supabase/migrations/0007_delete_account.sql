-- ============================================================================
-- 0007 — Eliminar cuenta (requisito de tiendas y confianza del usuario).
-- Función con privilegios del dueño: borra al usuario autenticado de
-- auth.users; todas sus tablas caen por ON DELETE CASCADE.
-- ============================================================================
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'No autenticado';
  end if;
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function public.delete_my_account() from public;
grant execute on function public.delete_my_account() to authenticated;
