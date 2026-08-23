-- ============================================================================
-- 0012 — Foto de perfil: columna avatar_url + bucket de storage 'avatars'.
-- ============================================================================

-- 1) URL pública de la foto de perfil (null = sin foto, se muestra la inicial)
alter table public.profiles
  add column if not exists avatar_url text;

-- 2) Bucket 'avatars': público para lectura (la foto se sirve por URL directa)
insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

-- 3) Políticas sobre storage.objects: cualquiera lee; cada usuario solo puede
--    escribir/actualizar/borrar dentro de SU carpeta. La ruta del objeto es
--    "{uid}/avatar.jpg", así que el primer segmento debe ser su auth.uid().
drop policy if exists avatars_public_read on storage.objects;
create policy avatars_public_read on storage.objects
  for select using (bucket_id = 'avatars');

drop policy if exists avatars_insert_own on storage.objects;
create policy avatars_insert_own on storage.objects
  for insert with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_update_own on storage.objects;
create policy avatars_update_own on storage.objects
  for update using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists avatars_delete_own on storage.objects;
create policy avatars_delete_own on storage.objects
  for delete using (
    bucket_id = 'avatars'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
