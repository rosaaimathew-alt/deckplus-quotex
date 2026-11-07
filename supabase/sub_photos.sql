-- ── Job photos from subs (Supabase Storage) ─────────────────────────────────
-- Applied after sub_role.sql (idempotent: safe to re-run).
--
-- A private bucket 'job-photos'. Each photo lives at
--   <org id>/<sub task id>/<yyyy-mm-dd>/<photo id>.jpg
-- and is listed on its task (sub_tasks.data.photos, src/lib/taskPhotos.js).
-- A sub's invoice files (photo or PDF) sit beside them at
--   <org id>/<sub task id>/invoices/<file id>.<jpg|pdf>
-- and are listed on the invoice (sub_draws.data.files).
--
--   sub              add and view photos on their own tasks only (a crew
--                    member: the tasks they're put on); never
--                    replace or delete one
--   pm / office /    view every photo in the company; add photos; the office
--   admin            and admins can delete one
--   everyone else    nothing (reps, paint PM, the public)

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('job-photos', 'job-photos', false, 10485760, array['image/jpeg','image/png','image/webp','image/heic','application/pdf'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit, allowed_mime_types = excluded.allowed_mime_types;

-- Is this photo path on a sub task the signed-in sub owns, or that their
-- company's PM put them on (crew)?
create or replace function public.own_sub_task_path(p_name text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.sub_tasks t
    where t.org_id = public.auth_org()
      and t.org_id::text = split_part(p_name, '/', 1)
      and t.id = split_part(p_name, '/', 2)
      and (t.owner_id = auth.uid() or t.crew_id = auth.uid())
      and t.deleted_at is null
  )
$$;
revoke all on function public.own_sub_task_path(text) from public, anon;
grant execute on function public.own_sub_task_path(text) to authenticated;

drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name)))
);

drop policy if exists job_photos_add on storage.objects;
create policy job_photos_add on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name)))
);

drop policy if exists job_photos_delete on storage.objects;
create policy job_photos_delete on storage.objects for delete to authenticated using (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and public.auth_role() in ('office','admin')
);
