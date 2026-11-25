-- ── A salesperson who also manages the jobs they sell ───────────────────────
-- Settings › Team › "Manages their own jobs" (org_members.permissions
-- 'pm.ownJobs' = true, set by the office with set_rep_runs_jobs). Such a
-- salesperson becomes the PM on the jobs they sell (src/lib/pmAssign.js,
-- api/sign/[token].js) and, on those jobs only, does what a PM does: books
-- subs, talks to them in the job chat, and sends them alerts. Any other job
-- stays out of reach, as for every salesperson.

-- True when the signed-in person is a salesperson with the switch on, and the
-- job is one they sold and are the PM on.
create or replace function public.rep_runs_job(p_job text) returns boolean
language sql stable security definer set search_path = public as $$
  select public.auth_role() = 'rep'
    and coalesce((select (m.permissions->>'pm.ownJobs')::boolean from public.org_members m
                  where m.org_id = public.auth_org() and m.user_id = auth.uid()), false)
    and exists (select 1 from public.proposals p
                where p.org_id = public.auth_org() and p.id = p_job and p.deleted_at is null
                  and p.owner_id = auth.uid() and p.pm_id = auth.uid())
$$;
revoke all on function public.rep_runs_job(text) from public, anon;
grant execute on function public.rep_runs_job(text) to authenticated;

-- The office turns the switch on or off for one salesperson
create or replace function public.set_rep_runs_jobs(p_user uuid, p_on boolean) returns jsonb
language plpgsql security definer set search_path = public as $$
declare me public.org_members; perms jsonb;
begin
  select * into me from public.org_members where user_id = auth.uid();
  if not found or me.role not in ('admin', 'office') then
    raise exception 'Only the office can change who manages their own jobs.' using errcode = '42501';
  end if;
  update public.org_members
     set permissions = case when p_on then coalesce(permissions, '{}'::jsonb) || jsonb_build_object('pm.ownJobs', true)
                            else coalesce(permissions, '{}'::jsonb) - 'pm.ownJobs' end
   where user_id = p_user and org_id = me.org_id and role = 'rep'
   returning permissions into perms;
  if not found then raise exception 'That salesperson is not on your team.' using errcode = '42501'; end if;
  return jsonb_build_object('ok', true, 'user_id', p_user, 'permissions', perms);
end $$;
revoke all on function public.set_rep_runs_jobs(uuid, boolean) from public, anon;
grant execute on function public.set_rep_runs_jobs(uuid, boolean) to authenticated;

-- Sub bookings on their own jobs
drop policy if exists sub_tasks_rep_pm on public.sub_tasks;
create policy sub_tasks_rep_pm on public.sub_tasks for all
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(data->>'proposalId'))
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(data->>'proposalId'));

-- The job chat with those subs
drop policy if exists sub_messages_rep_select on public.sub_messages;
create policy sub_messages_rep_select on public.sub_messages for select
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(proposal_id));
drop policy if exists sub_messages_rep_insert on public.sub_messages;
create policy sub_messages_rep_insert on public.sub_messages for insert
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(proposal_id)
              and data->>'from' = 'pm' and data->>'byId' = auth.uid()::text);
drop policy if exists sub_messages_rep_update on public.sub_messages;
create policy sub_messages_rep_update on public.sub_messages for update
  using (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(proposal_id))
  with check (org_id = (select public.auth_org()) and (select public.auth_role()) = 'rep' and public.rep_runs_job(proposal_id));

-- Alerts to the subs on those jobs (notify_targets, supabase/notify.sql) and
-- the job's inspection alerts (job_inspection_targets) count them as staff:
-- both functions are patched in place below so their other rules stay as they are.
do $$
declare d text;
begin
  d := pg_get_functiondef('public.notify_targets(text,text)'::regprocedure);
  if position('rep_runs_job' in d) = 0 then
    d := replace(d, 'staff := r in (''pm'', ''office'', ''admin'') or (r = ''paint'' and is_paint);',
                    'staff := r in (''pm'', ''office'', ''admin'') or (r = ''paint'' and is_paint) or (r = ''rep'' and public.rep_runs_job(t.data->>''proposalId''));');
    if position('rep_runs_job' in d) = 0 then raise exception 'notify_targets: staff line not found'; end if;
    execute d;
  end if;
  d := pg_get_functiondef('public.job_inspection_targets(text)'::regprocedure);
  if position('rep_runs_job' in d) = 0 then
    d := replace(d, 'r not in (''pm'', ''office'', ''admin'') then return null; end if;',
                    '(r not in (''pm'', ''office'', ''admin'') and not public.rep_runs_job(p_id)) then return null; end if;');
    if position('rep_runs_job' in d) = 0 then raise exception 'job_inspection_targets: role line not found'; end if;
    execute d;
  end if;
end $$;
