-- Project gallery — the customer-facing catalog of finished projects.
-- Run once in the Supabase SQL editor after schema.sql (idempotent: safe to re-run).
--
--   gallery_projects   one row per finished project: title, summary, tags and
--                      its photos (jsonb list; each photo has its own tags,
--                      caption and the photo adjustments the office made).
--   storage "gallery"  public image bucket. Files live under <org_id>/…, and
--                      only members of that org may add, replace or remove them.
--   gallery_public()   what the public /gallery page reads: published projects
--                      plus the company's name, logo and color. Nothing else
--                      in the org is reachable without signing in.

create table if not exists gallery_projects (
  id            uuid primary key default gen_random_uuid(),
  org_id        uuid not null references orgs(id) on delete cascade,
  title         text not null default '',
  summary       text not null default '',
  location      text not null default '',
  completed_on  date,
  tags          text[] not null default '{}',
  photos        jsonb not null default '[]'::jsonb,
  published     boolean not null default false,
  featured      boolean not null default false,
  sort_order    integer not null default 0,
  created_by    uuid default auth.uid(),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
create index if not exists gallery_projects_org_idx on gallery_projects (org_id, published, sort_order);

drop trigger if exists gallery_projects_updated_at on gallery_projects;
create trigger gallery_projects_updated_at before update on gallery_projects
  for each row execute function set_updated_at();

alter table gallery_projects enable row level security;
drop policy if exists gallery_org_all on gallery_projects;
create policy gallery_org_all on gallery_projects for all
  using (org_id = auth_org()) with check (org_id = auth_org());

-- ── Public read ─────────────────────────────────────────────────────────────
-- p_org may be null when the deployment holds a single company (the usual case).
create or replace function gallery_public(p_org uuid default null)
returns jsonb language sql stable security definer set search_path = public as $$
  with org as (
    select o.id, o.name from orgs o
    where p_org is null or o.id = p_org
    order by o.created_at
    limit 1
  )
  select jsonb_build_object(
    'company', (
      select jsonb_build_object(
        'name',  coalesce(nullif(s.data #>> '{branding,companyName}', ''), org.name),
        'logo',  s.data #>> '{branding,logo}',
        'color', s.data #>> '{branding,primaryColor}'
      )
      from org left join org_settings s on s.org_id = org.id
    ),
    'projects', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', g.id, 'title', g.title, 'summary', g.summary, 'location', g.location,
        'completedOn', g.completed_on, 'tags', to_jsonb(g.tags), 'photos', g.photos,
        'featured', g.featured
      ) order by g.featured desc, g.sort_order, g.completed_on desc nulls last, g.created_at desc)
      from gallery_projects g, org
      where g.org_id = org.id and g.published
    ), '[]'::jsonb)
  )
$$;
grant execute on function gallery_public(uuid) to anon, authenticated;

-- ── Photo storage ───────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public)
values ('gallery', 'gallery', true)
on conflict (id) do update set public = true;

drop policy if exists gallery_files_insert on storage.objects;
drop policy if exists gallery_files_update on storage.objects;
drop policy if exists gallery_files_delete on storage.objects;
create policy gallery_files_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth_org()::text);
create policy gallery_files_update on storage.objects for update to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth_org()::text);
create policy gallery_files_delete on storage.objects for delete to authenticated
  using (bucket_id = 'gallery' and (storage.foldername(name))[1] = auth_org()::text);
