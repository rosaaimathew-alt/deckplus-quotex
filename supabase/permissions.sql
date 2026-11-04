-- ── Per-person access switches ──────────────────────────────────────────────
-- Applied after schema.sql, invites.sql and paint_role.sql (idempotent).
-- A person's department (org_members.role) decides what they can have; an
-- admin can switch sections off for one person (Settings › Team › Access).
-- The switches live on org_members.permissions as { "<key>": false }; keys
-- are listed in src/permissions.js. The app hides switched-off sections; the
-- money ones are also refused here:
--
--   job_costs              needs 'job.money' or 'insights.profit'
--   expenses, finance_cards  need 'insights.expenses'

alter table public.org_members add column if not exists permissions jsonb not null default '{}'::jsonb;

-- Is this switch on for the signed-in person? (On unless set to false.)
create or replace function public.auth_can(k text) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (permissions->>k) is distinct from 'false'
                   from org_members where user_id = auth.uid() limit 1), true)
$$;
revoke execute on function public.auth_can(text) from public, anon;
grant execute on function public.auth_can(text) to authenticated;

alter policy job_costs_org_all on public.job_costs
  using (org_id = auth_org() and auth_role() in ('office','admin','pm')
         and (auth_can('job.money') or auth_can('insights.profit')))
  with check (org_id = auth_org() and auth_role() in ('office','admin','pm')
              and (auth_can('job.money') or auth_can('insights.profit')));
alter policy expenses_org_all on public.expenses
  using (org_id = auth_org() and auth_role() in ('office','admin') and auth_can('insights.expenses'))
  with check (org_id = auth_org() and auth_role() in ('office','admin') and auth_can('insights.expenses'));
alter policy finance_cards_org_all on public.finance_cards
  using (org_id = auth_org() and auth_role() in ('office','admin') and auth_can('insights.expenses'))
  with check (org_id = auth_org() and auth_role() in ('office','admin') and auth_can('insights.expenses'));

-- Admin only: set someone's switches (never your own — no locking yourself out).
create or replace function public.set_member_permissions(p_user uuid, p_permissions jsonb)
returns jsonb language plpgsql security definer set search_path = public as $$
declare me public.org_members; clean jsonb;
begin
  select * into me from public.org_members where user_id = auth.uid();
  if not found or me.role <> 'admin' then
    raise exception 'Only an admin can change what someone can see.' using errcode = '42501';
  end if;
  if p_user = me.user_id then raise exception 'You can''t change your own access.' using errcode = '42501'; end if;
  if not exists (select 1 from public.org_members where user_id = p_user and org_id = me.org_id) then
    raise exception 'That person is not on your team.' using errcode = '42501';
  end if;
  -- Keep only switched-off keys: { key: false }.
  select coalesce(jsonb_object_agg(key, false), '{}'::jsonb) into clean
    from jsonb_each(coalesce(p_permissions, '{}'::jsonb)) where value = 'false'::jsonb and length(key) <= 64;
  update public.org_members set permissions = clean where user_id = p_user and org_id = me.org_id;
  return jsonb_build_object('ok', true, 'user_id', p_user, 'permissions', clean);
end $$;
revoke all on function public.set_member_permissions(uuid, jsonb) from public, anon;
grant execute on function public.set_member_permissions(uuid, jsonb) to authenticated;
