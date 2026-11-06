-- Merchant homepage content. No sample content is inserted into a real store.
create table public.storefront_content (
  store_id text primary key references public.stores(id),
  content jsonb not null check (jsonb_typeof(content) = 'object'),
  updated_at timestamptz not null default clock_timestamp()
);
alter table public.storefront_content enable row level security;
alter table public.storefront_content force row level security;
create policy rbac_read on public.storefront_content for select to authenticated using (public.has_permission(store_id, 'content:read'));
grant all on public.storefront_content to service_role;
grant select on public.storefront_content to authenticated;

create function public.save_home(p_store_id text, p_content jsonb, p_expected_updated_at timestamptz)
returns void language plpgsql set search_path = '' as $$
declare v_current timestamptz;
begin
  -- Lock the store too, so simultaneous first saves cannot both insert.
  perform id from public.stores where id = p_store_id for update;
  if not found then raise exception 'not_found: Store not found.'; end if;
  select updated_at into v_current from public.storefront_content where store_id = p_store_id;
  if date_trunc('milliseconds', v_current) is distinct from date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'conflict: Someone else saved the homepage. Reload before saving.';
  end if;
  insert into public.storefront_content (store_id, content, updated_at) values (p_store_id, p_content, greatest(clock_timestamp(), coalesce(v_current, 'epoch'::timestamptz) + interval '1 millisecond'))
  on conflict (store_id) do update set content = excluded.content, updated_at = excluded.updated_at;
end $$;
revoke all on function public.save_home(text, jsonb, timestamptz) from public;
grant execute on function public.save_home(text, jsonb, timestamptz) to service_role;

-- Keep purchased photos available even after a product's current gallery changes.
create index order_lines_image_url on public.order_lines (image_url, order_id);
create function public.media_has_order_usage(p_store_id text, p_url text)
returns boolean language sql stable set search_path = '' as $$
  select exists (
    select 1 from public.order_lines l join public.orders o on o.id = l.order_id
    where o.store_id = p_store_id and l.image_url = p_url
  )
$$;
revoke all on function public.media_has_order_usage(text, text) from public;
grant execute on function public.media_has_order_usage(text, text) to service_role;
