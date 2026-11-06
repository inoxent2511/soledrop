-- Phase 2 admin foundation (docs/app/admin/admin-decisions.md A-001…A-008). Additive only.
-- Staff identity, RBAC (permissions, roles, role_permissions, staff_roles), invites, staff
-- sessions, extended audit_log, has_permission(), the last-Owner invariant, and the RPCs the
-- admin uses where a change must be atomic. RLS is enabled on every new table.

-- ─── Staff identity (A-001) ─────────────────────────────────────────────────
alter table public.staff_members alter column role drop not null;
alter table public.staff_members
  add column email text,
  add column display_name text not null default '',
  add column status text not null default 'active' check (status in ('invited', 'active', 'suspended')),
  add column password_hash text,
  add column totp_secret text,
  add column totp_enabled_at timestamptz,
  add column totp_last_step bigint,
  add column recovery_codes text[] not null default '{}',
  add column failed_logins integer not null default 0 check (failed_logins >= 0),
  add column locked_until timestamptz,
  add column last_seen_at timestamptz,
  add column updated_at timestamptz not null default now();
create unique index staff_members_store_email on public.staff_members (store_id, lower(email));

-- Optimistic concurrency reads updated_at, so every update moves it.
create function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := clock_timestamp();
  return new;
end
$$;
create trigger staff_members_touch before update on public.staff_members
  for each row execute function public.touch_updated_at();

-- ─── RBAC (A-007) ───────────────────────────────────────────────────────────
create table public.permissions (
  key text primary key check (key ~ '^[a-z_]+:[a-z_]+$'),
  label text not null,
  "group" text not null,
  sensitive boolean not null default false
);

create table public.roles (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete cascade,
  key text not null check (key ~ '^[a-z0-9_]{2,40}$'),
  name text not null check (length(name) between 1 and 60),
  description text not null default '',
  is_system boolean not null default false,
  refund_limit bigint check (refund_limit is null or refund_limit >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (store_id, key)
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission text not null references public.permissions (key) on delete cascade,
  primary key (role_id, permission)
);

create table public.staff_roles (
  user_id uuid not null,
  store_id text not null,
  role_id uuid not null references public.roles (id) on delete restrict,
  primary key (user_id, store_id, role_id),
  foreign key (user_id, store_id) references public.staff_members (user_id, store_id) on delete cascade
);
create index staff_roles_role on public.staff_roles (role_id);

-- ─── Invites and sessions (A-001, A-004) ────────────────────────────────────
create table public.staff_invites (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete cascade,
  email text not null,
  role_key text not null,
  token_hash text not null unique,
  invited_by uuid,
  expires_at timestamptz not null,
  accepted_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now()
);
create index staff_invites_store on public.staff_invites (store_id, created_at desc);

create table public.staff_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  store_id text not null,
  token_hash text not null unique,
  aal smallint not null check (aal in (1, 2)),
  mfa_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  foreign key (user_id, store_id) references public.staff_members (user_id, store_id) on delete cascade
);
create index staff_sessions_member on public.staff_sessions (store_id, user_id, last_seen_at desc);

-- ─── Audit context (A-006) ──────────────────────────────────────────────────
alter table public.audit_log
  add column store_id text,
  add column actor_role text,
  add column ip text,
  add column user_agent text,
  add column request_id text,
  add column reason text;
create index audit_log_store_at on public.audit_log (store_id, at desc);
create index audit_log_actor on public.audit_log (store_id, actor, at desc);

-- ─── Permission check for RLS (A-006 layer 3) ───────────────────────────────
-- SECURITY DEFINER with an empty search_path: policies can ask without reading the tables.
create function public.has_permission(p_store_id text, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.staff_members as member
    join public.staff_roles as link on link.user_id = member.user_id and link.store_id = member.store_id
    join public.role_permissions as grant_row on grant_row.role_id = link.role_id
    where member.user_id = (select auth.uid())
      and member.store_id = p_store_id
      and member.status = 'active'
      and grant_row.permission = p_permission
  )
$$;
revoke all on function public.has_permission(text, text) from public;
grant execute on function public.has_permission(text, text) to authenticated, service_role;

-- ─── Last active Owner (A-008) ──────────────────────────────────────────────
create function public.active_owner_count(p_store_id text)
returns integer
language sql
stable
set search_path = ''
as $$
  select count(*)::integer
  from public.staff_members as member
  join public.staff_roles as link on link.user_id = member.user_id and link.store_id = member.store_id
  join public.roles as role on role.id = link.role_id
  where member.store_id = p_store_id and member.status = 'active' and role.key = 'owner'
$$;
revoke all on function public.active_owner_count(text) from public;
grant execute on function public.active_owner_count(text) to service_role;

-- Deferred, so a swap inside one transaction (add a new Owner, then remove the old) is allowed.
create function public.assert_store_keeps_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  affected_store text := coalesce(old.store_id, new.store_id);
  had_owner boolean;
begin
  -- Only a change that removed an Owner can break the invariant; an empty store is allowed.
  if tg_table_name = 'staff_members' then
    had_owner := exists (
      select 1 from public.staff_roles as link join public.roles as role on role.id = link.role_id
      where link.store_id = old.store_id and link.user_id = old.user_id and role.key = 'owner'
    ) and old.status = 'active';
  else
    had_owner := exists (select 1 from public.roles as role where role.id = old.role_id and role.key = 'owner');
  end if;
  if had_owner and public.active_owner_count(affected_store) = 0 then
    raise exception 'conflict: The store must keep at least one active Owner.';
  end if;
  return null;
end
$$;

create constraint trigger staff_members_keep_owner
  after update of status or delete on public.staff_members
  deferrable initially deferred
  for each row execute function public.assert_store_keeps_owner();

create constraint trigger staff_roles_keep_owner
  after update or delete on public.staff_roles
  deferrable initially deferred
  for each row execute function public.assert_store_keeps_owner();

-- ─── Atomic admin operations (service role only) ────────────────────────────
-- Upserts the code registry (server/admin/permissions.ts): every permission, and the system
-- roles with exactly their permissions. Custom roles are never touched.
create function public.sync_admin_registry(p_store_id text, p_permissions jsonb, p_roles jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  preset jsonb;
  role_row_id uuid;
begin
  insert into public.permissions (key, label, "group", sensitive)
  select entry ->> 'key', entry ->> 'label', entry ->> 'group', coalesce((entry ->> 'sensitive')::boolean, false)
  from jsonb_array_elements(p_permissions) as entry
  on conflict (key) do update set label = excluded.label, "group" = excluded."group", sensitive = excluded.sensitive;

  for preset in select * from jsonb_array_elements(p_roles) loop
    insert into public.roles (store_id, key, name, description, is_system, refund_limit)
    values (p_store_id, preset ->> 'key', preset ->> 'name', preset ->> 'description', true, (preset ->> 'refund_limit')::bigint)
    on conflict (store_id, key) do update
      set name = excluded.name, description = excluded.description, is_system = true, refund_limit = excluded.refund_limit, updated_at = now()
    returning id into role_row_id;

    delete from public.role_permissions where role_id = role_row_id;
    insert into public.role_permissions (role_id, permission)
    select role_row_id, value from jsonb_array_elements_text(preset -> 'permissions');
  end loop;
end
$$;

-- Replaces a member's roles in one transaction; the deferred trigger checks the Owner invariant.
create function public.set_staff_roles(p_store_id text, p_user_id uuid, p_role_keys text[])
returns void
language plpgsql
set search_path = ''
as $$
begin
  if (select count(*) from public.roles where store_id = p_store_id and key = any (p_role_keys)) <> coalesce(array_length(p_role_keys, 1), 0) then
    raise exception 'validation: Unknown role.';
  end if;
  delete from public.staff_roles where store_id = p_store_id and user_id = p_user_id;
  insert into public.staff_roles (user_id, store_id, role_id)
  select p_user_id, p_store_id, id from public.roles where store_id = p_store_id and key = any (p_role_keys);
end
$$;

-- Creates or updates a custom role with its permissions. System roles: Owner is never editable;
-- other system roles keep their key and system flag.
create function public.save_role(
  p_store_id text, p_key text, p_name text, p_description text, p_refund_limit bigint,
  p_permissions text[], p_expected_updated_at timestamptz, p_create boolean
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  role_row public.roles;
begin
  if p_create then
    insert into public.roles (store_id, key, name, description, refund_limit)
    values (p_store_id, p_key, p_name, p_description, p_refund_limit)
    returning * into role_row;
  else
    select * into role_row from public.roles where store_id = p_store_id and key = p_key for update;
    if not found then raise exception 'not_found: Role not found.'; end if;
    if role_row.key = 'owner' then raise exception 'forbidden: The Owner role cannot be changed.'; end if;
    if p_expected_updated_at is not null and date_trunc('milliseconds', role_row.updated_at) <> date_trunc('milliseconds', p_expected_updated_at) then
      raise exception 'conflict: Someone else changed this role. Reload to see their changes.';
    end if;
    update public.roles set name = p_name, description = p_description, refund_limit = p_refund_limit, updated_at = now()
    where id = role_row.id;
  end if;
  delete from public.role_permissions where role_id = role_row.id;
  insert into public.role_permissions (role_id, permission) select role_row.id, unnest(p_permissions);
end
$$;

create function public.delete_role(p_store_id text, p_key text)
returns void
language plpgsql
set search_path = ''
as $$
declare
  role_row public.roles;
begin
  select * into role_row from public.roles where store_id = p_store_id and key = p_key for update;
  if not found then raise exception 'not_found: Role not found.'; end if;
  if role_row.is_system then raise exception 'forbidden: System roles cannot be deleted.'; end if;
  if exists (select 1 from public.staff_roles where role_id = role_row.id) then
    raise exception 'conflict: Staff members still have this role. Change their roles first.';
  end if;
  delete from public.roles where id = role_row.id;
end
$$;

revoke all on function public.sync_admin_registry(text, jsonb, jsonb) from public;
revoke all on function public.set_staff_roles(text, uuid, text[]) from public;
revoke all on function public.save_role(text, text, text, text, bigint, text[], timestamptz, boolean) from public;
revoke all on function public.delete_role(text, text) from public;
grant execute on function public.sync_admin_registry(text, jsonb, jsonb) to service_role;
grant execute on function public.set_staff_roles(text, uuid, text[]) to service_role;
grant execute on function public.save_role(text, text, text, text, bigint, text[], timestamptz, boolean) to service_role;
grant execute on function public.delete_role(text, text) to service_role;

-- ─── RLS (A-006): deny by default; staff act through has_permission() ───────
alter table public.permissions enable row level security;
alter table public.roles enable row level security;
alter table public.role_permissions enable row level security;
alter table public.staff_roles enable row level security;
alter table public.staff_invites enable row level security;
alter table public.staff_sessions enable row level security;

grant select on public.permissions, public.roles, public.role_permissions, public.staff_roles to authenticated;
grant select, insert, update on public.staff_invites to authenticated;

create policy staff_read on public.permissions for select to authenticated
  using (exists (select 1 from public.staff_members as m where m.user_id = (select auth.uid()) and m.status = 'active'));
create policy staff_read on public.roles for select to authenticated
  using (public.has_permission(store_id, 'staff:read'));
create policy staff_read on public.role_permissions for select to authenticated
  using (exists (select 1 from public.roles as r where r.id = role_id and public.has_permission(r.store_id, 'staff:read')));
create policy staff_read on public.staff_roles for select to authenticated
  using (public.has_permission(store_id, 'staff:read'));
create policy staff_manage on public.staff_invites for all to authenticated
  using (public.has_permission(store_id, 'staff:manage'))
  with check (public.has_permission(store_id, 'staff:manage'));
-- staff_sessions: no policy; sessions are read and written by the server only.

-- Staff with audit:read see their store's audit log (the phase 1 owner/manager policy stays).
create policy audit_read on public.audit_log for select to authenticated
  using (store_id is not null and public.has_permission(store_id, 'audit:read'));
