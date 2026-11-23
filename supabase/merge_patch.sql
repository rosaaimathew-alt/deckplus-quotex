-- ── Saves that merge inside a job, instead of replacing it ───────────────────
-- Applied after schema.sql (idempotent).
--
-- Everything about a job (checklist, stage dates, paint, touch-ups,
-- inspections, payments) lives in one key of the record: data.jobData. The
-- app saved a change by sending the whole key, so two people changing
-- different parts of the same job at about the same time (a PM ticking a stage
-- while the paint PM sets the colors) ended with the second save replacing the
-- first: one change silently lost.
--
-- Now the app sends only the parts that changed and names the keys to merge
-- (merge_keys). For those keys the database merges one level down: each part
-- sent replaces just that part, a part sent as null is removed, and the parts
-- not sent are left as they are. Other keys behave as before (patch_record
-- with three arguments, which app versions still open keep using).

create or replace function public.jsonb_merge_keys(old jsonb, patch jsonb, keys text[])
returns jsonb language plpgsql immutable as $$
declare result jsonb := coalesce(old, '{}'::jsonb) || (patch - keys); k text; merged jsonb;
begin
  foreach k in array coalesce(keys, '{}') loop
    continue when not (patch ? k);
    if jsonb_typeof(patch->k) = 'object' and jsonb_typeof(old->k) = 'object' then
      merged := (old->k) || (patch->k);
      -- a part sent as null is removed; a null that was already there and not sent stays
      select coalesce(jsonb_object_agg(e.key, e.value), '{}'::jsonb) into merged
        from jsonb_each(merged) e
       where not ((patch->k) ? e.key and (patch->k->e.key) = 'null'::jsonb);
      result := jsonb_set(result, array[k], merged);
    else
      result := jsonb_set(result, array[k], patch->k);
    end if;
  end loop;
  return result;
end $$;

create or replace function public.patch_record(tbl text, rid text, patch jsonb, merge_keys text[])
returns void language plpgsql security invoker set search_path = public as $$
begin
  if not (tbl = any(record_tables())) then raise exception 'unknown table %', tbl; end if;
  execute format('update %I set data = public.jsonb_merge_keys(data, $1, $3), deleted_at = null where org_id = auth_org() and id = $2', tbl)
    using patch, rid, merge_keys;
end $$;
revoke execute on function public.patch_record(text, text, jsonb, text[]) from public, anon;
grant execute on function public.patch_record(text, text, jsonb, text[]) to authenticated;

-- ── Loading pages in order without sorting the whole table each time ────────
-- The app loads a table in pages of 1,000, newest change first
-- (src/supabase.js fetchPage). With an index in exactly that order the
-- database reads each page straight off the index instead of sorting the
-- whole table for every page (2.6 s a page on purchases before).
create index if not exists proposals_org_page_idx on public.proposals (org_id, updated_at desc, id) where deleted_at is null;
create index if not exists purchases_org_page_idx on public.purchases (org_id, updated_at desc, id) where deleted_at is null;
create index if not exists invoices_org_page_idx  on public.invoices  (org_id, updated_at desc, id) where deleted_at is null;
create index if not exists vendors_org_page_idx   on public.vendors   (org_id, updated_at desc, id) where deleted_at is null;
create index if not exists catalog_items_org_page_idx on public.catalog_items (org_id, updated_at desc, id) where deleted_at is null;

-- ── Smaller cleanups the database's own advisor flagged ──────────────────────
create index if not exists org_members_org_idx on public.org_members (org_id);
create index if not exists org_invites_org_idx on public.org_invites (org_id);
-- The time clock's read rules: work out who is asking once per query, not per row
drop policy if exists time_shifts_read on public.time_shifts;
create policy time_shifts_read on public.time_shifts for select
  using (org_id = (select auth_org()) and (user_id = (select auth.uid()) or (select auth_role()) in ('office', 'admin', 'paint')));
drop policy if exists time_pings_read on public.time_pings;
create policy time_pings_read on public.time_pings for select
  using (org_id = (select auth_org()) and (user_id = (select auth.uid()) or (select auth_role()) in ('office', 'admin', 'paint')));
