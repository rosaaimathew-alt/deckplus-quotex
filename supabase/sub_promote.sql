-- ── Set an imported vendor up as a sub ───────────────────────────────────────
-- Applied after sub_role.sql and books.sql (idempotent).
--
-- Subs brought over from Knowify were filed as vendors of type 'sub' (table
-- vendors). The sub app, the "Invite" button and the list a PM books a sub
-- from all read the subcontractors table, so those subs could not be invited
-- or booked. This moves ONE of them over, when the office asks for it
-- (Money › Vendors › the sub › "Set up for the sub app"), in one step:
--
--   subcontractors   gets the record, same id, same details
--   purchases, bills that pointed at the vendor ('v:<id>') now point at the
--                    sub ('s:<id>'), so its spend and history stay with it
--   vendors          the old record is closed (soft-deleted, not erased)
--
-- Office / admin only. Nothing else about the POs or bills changes.

create or replace function public.promote_vendor_to_sub(p_vendor_id text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare my_org uuid := public.auth_org(); v public.vendors; n_po integer := 0; n_bill integer := 0;
begin
  if my_org is null or public.auth_role() not in ('admin','office') then
    raise exception 'Only an admin or the office can set a sub up for the sub app' using errcode = '42501';
  end if;
  select * into v from public.vendors where org_id = my_org and id = p_vendor_id and deleted_at is null for update;
  if not found then raise exception 'That vendor is not on your list' using errcode = '22023'; end if;
  if coalesce(v.data->>'type', '') <> 'sub' then
    raise exception 'Only a subcontractor can use the sub app. Change the vendor''s type to Subcontractor first.' using errcode = '22023';
  end if;
  if exists (select 1 from public.subcontractors where id = p_vendor_id) then
    raise exception 'A sub with this number already exists' using errcode = '23505';
  end if;

  insert into public.subcontractors (id, org_id, data, created_at, updated_at)
  values (v.id, my_org, v.data - 'type', v.created_at, now());

  update public.purchases set data = jsonb_set(data, '{vendorRef}', to_jsonb('s:' || p_vendor_id)), updated_at = now()
   where org_id = my_org and data->>'vendorRef' = 'v:' || p_vendor_id;
  get diagnostics n_po = row_count;
  update public.bills set data = jsonb_set(data, '{vendorRef}', to_jsonb('s:' || p_vendor_id)), updated_at = now()
   where org_id = my_org and data->>'vendorRef' = 'v:' || p_vendor_id;
  get diagnostics n_bill = row_count;

  update public.vendors set deleted_at = now(), updated_at = now() where org_id = my_org and id = p_vendor_id;
  return jsonb_build_object('id', p_vendor_id, 'purchases', n_po, 'bills', n_bill);
end $$;
revoke all on function public.promote_vendor_to_sub(text) from public, anon;
grant execute on function public.promote_vendor_to_sub(text) to authenticated;
