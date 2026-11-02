-- ============================================================================
-- 0019 — Color propio y foto de portada de cada meta
--        (spec docs/superpowers/specs/2026-11-02-color-y-portada-de-meta-design.md).
-- Idempotente: se puede correr más de una vez en el SQL editor de Supabase.
-- ============================================================================

-- 1) Columnas nuevas en goals. La RLS de goals (cada quien sus filas) ya las
--    cubre: esta migración no abre ningún acceso nuevo.
alter table public.goals
  add column if not exists color text;
alter table public.goals
  add column if not exists cover_path text;
alter table public.goals
  add column if not exists cover_on_card boolean not null default false;

-- color: null (= el del área) o una clave de la paleta cerrada. La misma lista
-- vive en src/lib/goalAccent.ts (GOAL_COLORS).
alter table public.goals drop constraint if exists goals_color_check;
alter table public.goals
  add constraint goals_color_check
  check (color is null or color in (
    'salud','finanzas','bienestar','carrera','aprendizaje','relaciones','creatividad','otra'
  ));

-- cover_path: null o "{user_id}/{nombre}.webp|.jpg" dentro de la carpeta del
-- dueño de la meta (nadie apunta su meta a la foto de otra persona).
alter table public.goals drop constraint if exists goals_cover_path_check;
alter table public.goals
  add constraint goals_cover_path_check
  check (
    cover_path is null
    or (
      split_part(cover_path, '/', 1) = user_id::text
      and cover_path ~ '^[A-Za-z0-9-]+/[A-Za-z0-9-]+\.(webp|jpg)$'
    )
  );

-- 2) Bucket PRIVADO 'goal-covers': sin URL pública (se sirve con URL firmada de
--    1 h). El servidor de Storage rechaza lo que pese más de 1.5 MB o no sea
--    WebP/JPEG, diga lo que diga el cliente. JPEG queda admitido porque Safari
--    (iOS) no sabe codificar WebP en canvas; ambos se re-codifican sin EXIF.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('goal-covers', 'goal-covers', false, 1572864, array['image/webp', 'image/jpeg'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- 3) Políticas sobre storage.objects: cada usuario autenticado solo lee, sube,
--    actualiza y borra dentro de SU carpeta. La ruta es "{uid}/{goalId}-{ts}.webp",
--    así que el primer segmento debe ser su auth.uid().
drop policy if exists goal_covers_select_own on storage.objects;
create policy goal_covers_select_own on storage.objects
  for select to authenticated using (
    bucket_id = 'goal-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists goal_covers_insert_own on storage.objects;
create policy goal_covers_insert_own on storage.objects
  for insert to authenticated with check (
    bucket_id = 'goal-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists goal_covers_update_own on storage.objects;
create policy goal_covers_update_own on storage.objects
  for update to authenticated using (
    bucket_id = 'goal-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  ) with check (
    bucket_id = 'goal-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists goal_covers_delete_own on storage.objects;
create policy goal_covers_delete_own on storage.objects
  for delete to authenticated using (
    bucket_id = 'goal-covers'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
