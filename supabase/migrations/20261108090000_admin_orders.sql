-- Admin A2 (orders): staff notes, indexes for the staff order search, and RBAC read policies on
-- the order tables alongside the phase 1 role policies. Additive only.

create table public.order_notes (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders (id) on delete cascade,
  author uuid not null,
  author_name text not null,
  body text not null check (length(body) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index order_notes_order on public.order_notes (order_id, created_at);

alter table public.order_notes enable row level security;
grant select on public.order_notes to authenticated;
create policy staff_read on public.order_notes for select to authenticated
  using (exists (select 1 from public.orders as o where o.id = order_id and public.has_permission(o.store_id, 'orders:read')));

-- Staff search: newest first, by status, by payment status.
create index orders_store_placed on public.orders (store_id, placed_at desc);
create index orders_store_status on public.orders (store_id, status, placed_at desc);
create index orders_store_payment on public.orders (store_id, payment_status, placed_at desc);

-- RBAC staff (admin roles) read orders through orders:read, in addition to the phase 1 staff_role policies.
create policy rbac_read on public.orders for select to authenticated using (public.has_permission(store_id, 'orders:read'));
create policy rbac_read on public.order_lines for select to authenticated
  using (exists (select 1 from public.orders as o where o.id = order_id and public.has_permission(o.store_id, 'orders:read')));
create policy rbac_read on public.payments for select to authenticated
  using (exists (select 1 from public.orders as o where o.id = order_id and public.has_permission(o.store_id, 'payments:read')));
create policy rbac_read on public.refunds for select to authenticated
  using (exists (select 1 from public.orders as o where o.id = order_id and public.has_permission(o.store_id, 'orders:read')));
create policy rbac_read on public.returns for select to authenticated
  using (exists (select 1 from public.orders as o where o.id = order_id and public.has_permission(o.store_id, 'orders:read')));
