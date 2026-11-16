-- ── A job's own files, kept in the app (Supabase Storage) ───────────────────
-- Applied after paint_crew.sql (idempotent: safe to re-run).
--
-- Photos and PDFs added on a job (Jobs › Photos and Documents) live in the
-- private 'job-photos' bucket at
--   <org id>/job-<proposal id>/<file id>.<jpg|pdf>
-- and are listed on the job (proposals.data.jobData.documents,
-- src/lib/taskPhotos.js), instead of going to Google Drive.
--
--   pm / office / admin   already see and add everything in the bucket
--   rep                   sees and adds a job's own files (the job-… folders),
--                         never the subs' or painters' photo folders
--   sub / paint           unchanged: their own tasks' photos only

drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'rep' and split_part(name, '/', 2) like 'job-%')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);

drop policy if exists job_photos_add on storage.objects;
create policy job_photos_add on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() = 'rep' and split_part(name, '/', 2) like 'job-%')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);
