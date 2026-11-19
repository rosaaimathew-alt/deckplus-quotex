-- ── To-do lists: mine, and tasks given to a teammate ─────────────────────────
-- A to-do belongs to the person who wrote it (owner_id, filled in by the
-- database when the row is first saved; the app never sends it). Nobody else
-- on the team receives it.
--
-- A to-do with data.assignedTo set was given to that teammate (To-do › Shared
-- in the office app, src/lib/todos.js). It then reaches two people: the one
-- who wrote it and the one it was given to. The teammate is told by
-- notify_targets('todo_assigned') in supabase/notify.sql.
--
-- Subs and painters never reach a to-do: the sub is shut out here, and both
-- by todos_org_all (supabase/sub_role.sql).
--
-- Run once in the Supabase SQL editor, then run supabase/notify.sql (it holds
-- the alert function with the todo_assigned kind). Safe to re-run.

alter table public.todos add column if not exists owner_id uuid default auth.uid();

do $$
begin
  if exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'todos' and policyname = 'todos_owner_only') then
    alter policy todos_owner_only on public.todos
      using ((owner_id = (select auth.uid()) or data->>'assignedTo' = (select auth.uid())::text) and (select auth_role()) is distinct from 'sub')
      with check ((owner_id = (select auth.uid()) or data->>'assignedTo' = (select auth.uid())::text) and (select auth_role()) is distinct from 'sub');
  else
    create policy todos_owner_only on public.todos as restrictive for all to authenticated
      using ((owner_id = (select auth.uid()) or data->>'assignedTo' = (select auth.uid())::text) and (select auth_role()) is distinct from 'sub')
      with check ((owner_id = (select auth.uid()) or data->>'assignedTo' = (select auth.uid())::text) and (select auth_role()) is distinct from 'sub');
  end if;
end $$;
