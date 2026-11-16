-- ── Spec sheets for the trade that builds from them ─────────────────────────
-- Applied after paint_crew.sql (idempotent: safe to re-run).
--
-- sub_job_sheet() now also hands back, from the job's contract as it was sent:
--   an electrical booking   the Electrical Specifications page's answers
--   a roofing booking       the Porch Detail Form's answers
-- (a booking counts by its trade, its title or the sub's trade), and only when
-- that sheet is on the contract. The lists below are the fields those two
-- pages print (src/contract/deckPlusAgreement.js). Still no prices, and no
-- customer phone or email: a sub gets neither anywhere else.

create or replace function public.sub_job_sheet(p_task_id text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); r text := public.auth_role(); t public.sub_tasks; p public.proposals; d jsonb; vals jsonb; jd jsonb; pt jsonb;
  trade text; rec jsonb; nxt jsonb; dp jsonb; sheets jsonb := '[]'::jsonb; keep_v text[] := array[]::text[]; keep_c text[] := array[]::text[];
  porch_v constant text[] := array['jobName','contractNum','sidingWhere','roofType','shingleBrand','kneeHeight','kneeInside','kneeOutside','railCap','railBaluster','railCompositeType','railCompositeColor','railAlumColor','doorColor','doorType','screenFrameColor','postOther','gutterColor','winSize','winGrille','winColor','winStyle'];
  porch_c constant text[] := array['jt_screen','jt_3season','jt_open','jt_other','hdr_pt','hdr_lvl','wrap_miratec','wrap_pine','gable_open','gable_closed','gable_screen','gable_glass','siding_yes','siding_no','conn_roof','conn_wall','conn_both','sh_3tab','sh_arch','rail_yes','rail_no','rail_composite','rail_alum','door_larson','ss_screeneze','ss_ezebreeze','post_6pt','post_6lam','post_8pt','post_8lam','post_other','gut_regular','gut_jumbo','ceil_plybead','ceil_tg','box_wood','box_vinyl','box_xl','paint_client','paint_deckplus','vc_clear','vc_smoke','vc_dark','vc_bronze','fc_white','fc_bronze','fc_beige','fc_khaki','fc_black','mw_vertical','mw_horizontal'];
begin
  if my_org is null or r is null then return null; end if;
  select * into t from public.sub_tasks where org_id = my_org and id = p_task_id and deleted_at is null;
  if not found then return null; end if;
  if r = 'sub' and t.owner_id is distinct from auth.uid() and t.crew_id is distinct from auth.uid() then return null; end if;
  if r = 'paint' and not coalesce((t.data->>'paint')::boolean, false) then return null; end if;
  select * into p from public.proposals where org_id = my_org and id = (t.data->>'proposalId') and deleted_at is null;
  if not found then return null; end if;
  d := coalesce(p.data->'contractDraft', '{}'::jsonb);
  jd := case when jsonb_typeof(p.data->'jobData') = 'object' then p.data->'jobData' else '{}'::jsonb end;
  pt := case when jsonb_typeof(jd->'paint') = 'object' then jd->'paint' else '{}'::jsonb end;
  vals := case when jsonb_typeof(d->'dp'->'values') = 'object' then d->'dp'->'values' else '{}'::jsonb end;

  -- The contract as it was sent (the signing record; a replaced send points at
  -- the newer one), and from it only the spec sheets for this booking's trade.
  trade := lower(concat_ws(' ', t.data->>'trade', t.data->>'title',
    (select s.data->>'trade' from public.subcontractors s where s.org_id = my_org and s.id = (t.data->>'subId') and s.deleted_at is null)));
  if (d->>'signRecordId') is not null then
    select value into rec from public.app_kv where key = 'sign:' || (d->>'signRecordId') and (expires_at is null or expires_at > now());
    for hop in 1..10 loop
      exit when rec is null or (rec->>'status') is distinct from 'superseded' or (rec->>'supersededBy') is null;
      select value into nxt from public.app_kv where key = 'sign:' || (rec->>'supersededBy') and (expires_at is null or expires_at > now());
      exit when nxt is null;
      rec := nxt;
    end loop;
    if rec is not null and (rec->'contractData'->>'proposalId') is distinct from p.id then rec := null; end if;
  end if;
  dp := case when jsonb_typeof(rec->'contractData'->'dp') = 'object' then rec->'contractData'->'dp' else null end;
  if dp is not null and jsonb_typeof(dp->'packet') = 'array' then
    if trade ~ 'electr' and dp->'packet' ? 'electrical' then
      sheets := sheets || '"electrical"'::jsonb;
      keep_v := keep_v || array['clientName','contractNum'];
    end if;
    if trade ~ 'roof' and dp->'packet' ? 'porch' then
      sheets := sheets || '"porch"'::jsonb;
      keep_v := keep_v || porch_v; keep_c := keep_c || porch_c;
    end if;
  end if;
  return jsonb_build_object(
    'electrical', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(vals) where key like 'elecQty\_%' or key like 'elecOther%'),
    'completedStages', coalesce(jd->'completedStages', '[]'::jsonb),
    'stageDates', case when jsonb_typeof(jd->'stageDates') = 'object' then jd->'stageDates' else '{}'::jsonb end,
    'projectTypeOverride', jd->'projectTypeOverride',
    'projectTypes', coalesce(d->'projectTypes', '[]'::jsonb),
    'hasWindows', (coalesce(d->'scopeBullets', '[]'::jsonb)::text || coalesce(d->'scopeLines', '[]'::jsonb)::text) ~* 'window|glass|enclos',
    -- What the job includes, as text, so the sub's checklist is the office's
    -- (getStages in src/pages/Jobs.jsx). Names and descriptions only, no prices.
    'checklistText', left(concat_ws(' \n ',
        (select string_agg(x, ' ') from jsonb_array_elements_text(case when jsonb_typeof(p.data->'projectTypes') = 'array' then p.data->'projectTypes' else '[]'::jsonb end) x),
        (select string_agg(x, ' ') from jsonb_array_elements_text(case when jsonb_typeof(d->'projectTypes') = 'array' then d->'projectTypes' else '[]'::jsonb end) x),
        p.data->>'projectSummary',
        (select string_agg(concat_ws(' ', l->>'name', l->>'category', l->>'description'), ' \n ') from jsonb_array_elements(case when jsonb_typeof(p.data->'lines') = 'array' then p.data->'lines' else '[]'::jsonb end) l),
        (select string_agg(concat_ws(' ', x->>'type', x->>'description'), ' \n ') from jsonb_array_elements(case when jsonb_typeof(p.data->'countyPermit'->'permits') = 'array' then p.data->'countyPermit'->'permits' else '[]'::jsonb end) x)
      ), 8000),
    -- Electrical Specifications for an electrician, Porch Detail Form for a
    -- roofer: the sheet's own answers only. No prices, no customer phone or email.
    'specs', case when jsonb_array_length(sheets) = 0 then null else jsonb_build_object(
        'forms', sheets,
        'values', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(dp->'values') = 'object' then dp->'values' else '{}'::jsonb end)
                   where key = any(keep_v) or (sheets ? 'electrical' and (key like 'elecQty\_%' or key like 'elecOther%'))),
        'checks', (select coalesce(jsonb_object_agg(key, value), '{}'::jsonb) from jsonb_each(case when jsonb_typeof(dp->'checks') = 'object' then dp->'checks' else '{}'::jsonb end)
                   where key = any(keep_c)))
      end,
    'paint', case when coalesce((t.data->>'paint')::boolean, false) then jsonb_build_object(
        'colors', coalesce(pt->'colors', '[]'::jsonb), 'product', pt->'product', 'color', pt->'color', 'sheen', pt->'sheen', 'areas', pt->'areas',
        'notes', pt->'notes', 'date', jd->'stageDates'->'paint',
        'touchUps', coalesce((select jsonb_agg(jsonb_build_object('text', x->>'text'))
                              from jsonb_array_elements(case when jsonb_typeof(jd->'touchUps') = 'array' then jd->'touchUps' else '[]'::jsonb end) x
                              where not coalesce((x->>'done')::boolean, false)), '[]'::jsonb))
      else null end
  );
end $$;
revoke all on function public.sub_job_sheet(text) from public, anon;
grant execute on function public.sub_job_sheet(text) to authenticated;
