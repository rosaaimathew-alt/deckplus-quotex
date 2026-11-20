-- ── The paint PM adds photos to a job ────────────────────────────────────────
-- Applied after paint_role.sql and job_files.sql (idempotent: safe to re-run).
--
-- The paint job page (src/field/PaintApp.jsx) has the job's Photos: the paint
-- PM adds pictures, kept like the office's own job photos
-- (jobData.documents, files at <org>/job-<proposal id>/<id>.jpg in the
-- 'job-photos' bucket, src/lib/taskPhotos.js).
--
--   storage   paint may add and open files in a job's own folder (job-…),
--             as a rep can; deleting stays office / admin only.
--   proposals paint may add entries to jobData.documents, in the Photos
--             folder, but never change or take away one already there.

-- 1. The paint guard, now also allowing new photos on jobData.documents
create or replace function public.paint_guard_proposal() returns trigger
language plpgsql set search_path = public as $$
declare
  o  jsonb := case when jsonb_typeof(old.data->'jobData') = 'object' then old.data->'jobData' else '{}'::jsonb end;
  n  jsonb := case when jsonb_typeof(new.data->'jobData') = 'object' then new.data->'jobData' else '{}'::jsonb end;
  os jsonb; ns jsonb; oc jsonb; nc jsonb;
  k  text;
  msg constant text := 'permission denied: the paint PM can only change paint details on a job';
begin
  if auth_role() is distinct from 'paint' then return new; end if;

  if (old.data - 'jobData') is distinct from (new.data - 'jobData')
     or new.deleted_at is distinct from old.deleted_at
     or new.org_id is distinct from old.org_id
     or new.id is distinct from old.id then
    raise exception '%', msg using errcode = '42501';
  end if;

  for k in select jsonb_object_keys(o || n) loop
    continue when (o->k) is not distinct from (n->k);
    continue when k in ('paint', 'touchUps', 'paymentsReceived', 'dailyLogs');
    if k = 'stageDates' then
      os := case when jsonb_typeof(o->k) = 'object' then o->k else '{}'::jsonb end;
      ns := case when jsonb_typeof(n->k) = 'object' then n->k else '{}'::jsonb end;
      continue when (os - 'paint') = (ns - 'paint');
    elsif k = 'completedStages' then
      oc := case when jsonb_typeof(o->k) = 'array' then o->k else '[]'::jsonb end;
      nc := case when jsonb_typeof(n->k) = 'array' then n->k else '[]'::jsonb end;
      continue when not exists (
        select 1 from (
          (select jsonb_array_elements_text(oc) except select jsonb_array_elements_text(nc))
          union
          (select jsonb_array_elements_text(nc) except select jsonb_array_elements_text(oc))
        ) d(v) where v <> 'paint'
      );
    elsif k = 'documents' then
      -- Only additions: every file already on the job stays exactly as it was,
      -- and each new one is a photo in this job's own folder.
      oc := case when jsonb_typeof(o->k) = 'array' then o->k else '[]'::jsonb end;
      nc := case when jsonb_typeof(n->k) = 'array' then n->k else '[]'::jsonb end;
      continue when jsonb_typeof(n->k) = 'array'
        and not exists (select 1 from jsonb_array_elements(oc) e(v) where not (nc @> jsonb_build_array(e.v)))
        and not exists (
          select 1 from jsonb_array_elements(nc) e(v)
          where not (oc @> jsonb_build_array(e.v))
            and (e.v->>'folder' is distinct from 'Photos'
                 or split_part(coalesce(e.v->>'path', ''), '/', 2) is distinct from 'job-' || new.id::text)
        );
    end if;
    raise exception '%', msg using errcode = '42501';
  end loop;
  return new;
end $$;

-- 2. Storage: paint adds and opens files in a job's own folder
drop policy if exists job_photos_read on storage.objects;
create policy job_photos_read on storage.objects for select to authenticated using (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() in ('rep','paint') and split_part(name, '/', 2) like 'job-%')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);

drop policy if exists job_photos_add on storage.objects;
create policy job_photos_add on storage.objects for insert to authenticated with check (
  bucket_id = 'job-photos'
  and split_part(name, '/', 1) = public.auth_org()::text
  and (public.auth_role() in ('pm','office','admin')
       or (public.auth_role() in ('rep','paint') and split_part(name, '/', 2) like 'job-%')
       or (public.auth_role() = 'sub' and public.own_sub_task_path(name))
       or (public.auth_role() = 'paint' and public.paint_task_path(name)))
);
