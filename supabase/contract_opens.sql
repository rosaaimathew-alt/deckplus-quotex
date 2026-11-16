-- ── When customers opened their contract (Contracts › Opens) ────────────────
-- Applied after esign.sql (idempotent: safe to re-run).
--
-- Every time a customer (not the builder, not staff previewing) opens a
-- contract's signing link the signing API logs it (esign_events, 'opened';
-- 'opened_replaced_link' when they used a link that was since replaced).
-- This hands those times to the Contracts page, newest first, for the jobs
-- the signed-in person can see: the office and admins every job, a sales rep
-- their own, a PM the jobs they run. No signer details, only job and time.
create or replace function public.contract_opens()
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); uid uuid := auth.uid();
begin
  if my_org is null or uid is null or r is null or r not in ('office', 'admin', 'rep', 'pm') then return '[]'::jsonb; end if;
  return (
    select coalesce(jsonb_agg(jsonb_build_object('proposalId', x.proposal_id, 'recordId', x.record_id, 'at', x.at_ms, 'role', x.role) order by x.at_ms desc), '[]'::jsonb)
    from (
      select p.id as proposal_id, e.record_id, e.at_ms, e.role
      from public.esign_events e
      join public.app_kv k on k.key = 'sign:' || e.record_id
      join public.proposals p on p.org_id = my_org and p.id = (k.value->'contractData'->>'proposalId') and p.deleted_at is null
      where e.record_type = 'contract' and e.event in ('opened', 'opened_replaced_link') and e.role is distinct from 'builder'
        and (r in ('office', 'admin') or (r = 'rep' and p.owner_id = uid) or (r = 'pm' and p.pm_id = uid))
      order by e.at_ms desc limit 1000
    ) x);
end $$;
revoke all on function public.contract_opens() from public, anon;
grant execute on function public.contract_opens() to authenticated;
