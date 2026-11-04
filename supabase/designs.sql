-- ── Proposal designs ────────────────────────────────────────────────────────
-- The layout drawn in the design editor (public/design-editor.html) for a
-- proposal: decks, landings, stair runs and decking color, as the editor's own
-- JSON. One row per proposal. Kept out of the proposal record so a proposal
-- edit in the app never overwrites a drawing (and vice versa).
--
-- Who can see / save a design is whoever can see the proposal (proposals RLS:
-- a rep their own deals, a PM their assigned ones, office and admin all).

create table if not exists proposal_designs (
  org_id      uuid not null default auth_org() references orgs(id) on delete cascade,
  proposal_id text not null,
  data        jsonb not null default '{}'::jsonb,
  updated_by  uuid default auth.uid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  primary key (org_id, proposal_id)
);
alter table proposal_designs enable row level security;

drop trigger if exists proposal_designs_updated_at on proposal_designs;
create trigger proposal_designs_updated_at before update on proposal_designs
  for each row execute function set_updated_at();

drop policy if exists proposal_designs_select on proposal_designs;
drop policy if exists proposal_designs_insert on proposal_designs;
drop policy if exists proposal_designs_update on proposal_designs;
-- The proposals check runs under the caller's own proposals RLS.
create policy proposal_designs_select on proposal_designs for select using (
  org_id = auth_org() and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id)
);
create policy proposal_designs_insert on proposal_designs for insert with check (
  org_id = auth_org() and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id)
);
create policy proposal_designs_update on proposal_designs for update using (
  org_id = auth_org() and exists (select 1 from proposals p where p.org_id = proposal_designs.org_id and p.id = proposal_designs.proposal_id)
) with check (org_id = auth_org());
