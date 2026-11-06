-- Admin A3 (products, collections, inventory, media). Additive only: two RPCs for atomic staff
-- saves, the media library table, and RBAC read policies for drafts and stock.

-- ─── save_product ───────────────────────────────────────────────────────────
-- Creates or updates one product by id with images, variants, stock rows and collection links.
-- Refuses a stale save (optimistic concurrency), a slug or SKU another product uses, and removing
-- a size that was ever ordered. Returns the new updated_at.
create function public.save_product(p_store_id text, p_product jsonb, p_expected_updated_at timestamptz)
returns timestamptz
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := (p_product ->> 'id')::uuid;
  v_current timestamptz;
  v_removed uuid[];
  v_saved timestamptz;
begin
  select updated_at into v_current from public.products where id = v_id and store_id = p_store_id for update;
  -- Compared to the millisecond: clients round-trip the timestamp through JavaScript dates.
  if found and p_expected_updated_at is not null and date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', p_expected_updated_at) then
    raise exception 'conflict: Someone else saved this product since you opened it. Reload to see their changes.';
  end if;
  if exists (select 1 from public.products where store_id = p_store_id and slug = p_product ->> 'slug' and id <> v_id) then
    raise exception 'conflict: Another product already uses this web address (slug).';
  end if;
  if exists (
    select 1 from public.variants as v
    where v.sku in (select x ->> 'sku' from jsonb_array_elements(coalesce(p_product -> 'variants', '[]')) as x)
      and v.product_id <> v_id
  ) then
    raise exception 'conflict: A SKU is already used by another product.';
  end if;

  select array_agg(v.id) into v_removed from public.variants as v
  where v.product_id = v_id
    and v.id not in (select (x ->> 'id')::uuid from jsonb_array_elements(coalesce(p_product -> 'variants', '[]')) as x);
  if v_removed is not null and exists (select 1 from public.order_lines where variant_id = any (v_removed)) then
    raise exception 'conflict: A size that has been ordered can''t be removed. Archive the product instead.';
  end if;

  insert into public.products (
    id, store_id, slug, title, brand_id, kind, gender, status, description, condition_grade, condition_notes,
    attributes, custom_fields, tags, position, published_at, seo, updated_at
  ) values (
    v_id, p_store_id, p_product ->> 'slug', p_product ->> 'title', (p_product -> 'brand' ->> 'id')::uuid,
    (p_product ->> 'kind')::public.product_kind, (p_product ->> 'gender')::public.product_gender,
    (p_product ->> 'status')::public.product_status, coalesce(p_product ->> 'description', ''),
    (p_product ->> 'condition')::public.condition_grade, p_product ->> 'conditionNotes',
    coalesce(p_product -> 'attributes', '{}'), coalesce(p_product -> 'customFields', '{}'),
    array(select jsonb_array_elements_text(coalesce(p_product -> 'tags', '[]'))),
    coalesce((p_product ->> 'position')::integer, 0), coalesce((p_product ->> 'publishedAt')::timestamptz, now()),
    coalesce(p_product -> 'seo', '{}'), clock_timestamp()
  )
  on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, brand_id = excluded.brand_id, kind = excluded.kind, gender = excluded.gender,
    status = excluded.status, description = excluded.description, condition_grade = excluded.condition_grade,
    condition_notes = excluded.condition_notes, attributes = excluded.attributes, custom_fields = excluded.custom_fields,
    tags = excluded.tags, position = excluded.position, published_at = excluded.published_at, seo = excluded.seo,
    updated_at = clock_timestamp()
  returning updated_at into v_saved;

  delete from public.product_images where product_id = v_id;
  insert into public.product_images (product_id, url, alt, width, height, role, position)
    select v_id, image ->> 'url', coalesce(image ->> 'alt', ''), (image ->> 'width')::integer, (image ->> 'height')::integer,
      coalesce(image ->> 'role', 'gallery')::public.image_role, (ordinality - 1)::integer
    from jsonb_array_elements(coalesce(p_product -> 'images', '[]')) with ordinality as images (image, ordinality);

  delete from public.variants where id = any (coalesce(v_removed, '{}'));
  insert into public.variants (id, product_id, sku, size_eu, size_uk, size_us, size_cm, attributes, weight_grams, position)
    select (v ->> 'id')::uuid, v_id, v ->> 'sku', v -> 'size' ->> 'eu', v -> 'size' ->> 'uk', v -> 'size' ->> 'us', v -> 'size' ->> 'cm',
      coalesce(v -> 'attributes', '{}'), coalesce((v ->> 'weightGrams')::integer, 0), coalesce((v ->> 'position')::integer, 0)
    from jsonb_array_elements(coalesce(p_product -> 'variants', '[]')) as variants (v)
  on conflict (id) do update set
    sku = excluded.sku, size_eu = excluded.size_eu, size_uk = excluded.size_uk, size_us = excluded.size_us,
    size_cm = excluded.size_cm, attributes = excluded.attributes, weight_grams = excluded.weight_grams, position = excluded.position;
  insert into public.inventory_levels (variant_id)
    select (v ->> 'id')::uuid from jsonb_array_elements(coalesce(p_product -> 'variants', '[]')) as variants (v)
  on conflict (variant_id) do nothing;

  delete from public.collection_products where product_id = v_id;
  insert into public.collection_products (collection_id, product_id)
    select c.id, v_id from public.collections as c
    where c.store_id = p_store_id and c.kind = 'manual' and c.slug in (select jsonb_array_elements_text(coalesce(p_product -> 'collections', '[]')));
  return v_saved;
end
$$;

-- ─── save_collection ────────────────────────────────────────────────────────
-- Creates or updates a collection by id; a manual collection's products are replaced when
-- p_product_ids is given, a rule collection keeps no product links.
create function public.save_collection(p_store_id text, p_collection jsonb, p_product_ids uuid[])
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := (p_collection ->> 'id')::uuid;
begin
  if exists (select 1 from public.collections where store_id = p_store_id and slug = p_collection ->> 'slug' and id <> v_id) then
    raise exception 'conflict: Another collection already uses this web address (slug).';
  end if;
  insert into public.collections (id, store_id, slug, title, headline, description, kind, rules, image, position, seo)
  values (
    v_id, p_store_id, p_collection ->> 'slug', p_collection ->> 'title', coalesce(p_collection -> 'headline', '["", ""]'),
    coalesce(p_collection ->> 'description', ''), p_collection ->> 'kind', p_collection -> 'rules', p_collection -> 'image',
    coalesce((p_collection ->> 'position')::integer, 0), coalesce(p_collection -> 'seo', '{}')
  )
  on conflict (id) do update set
    slug = excluded.slug, title = excluded.title, headline = excluded.headline, description = excluded.description,
    kind = excluded.kind, rules = excluded.rules, image = excluded.image, position = excluded.position, seo = excluded.seo;

  if p_collection ->> 'kind' = 'rule' then
    delete from public.collection_products where collection_id = v_id;
  elsif p_product_ids is not null then
    delete from public.collection_products where collection_id = v_id;
    insert into public.collection_products (collection_id, product_id, position)
      select v_id, p.id, (ordinality - 1)::integer
      from unnest(p_product_ids) with ordinality as ids (product_id, ordinality)
      join public.products as p on p.id = ids.product_id and p.store_id = p_store_id;
  end if;
end
$$;

revoke all on function public.save_product(text, jsonb, timestamptz) from public;
revoke all on function public.save_collection(text, jsonb, uuid[]) from public;
grant execute on function public.save_product(text, jsonb, timestamptz) to service_role;
grant execute on function public.save_collection(text, jsonb, uuid[]) to service_role;

-- ─── Media library ──────────────────────────────────────────────────────────
-- Files live in object storage (Supabase Storage bucket `media`, runbook); this is the index.
create table public.media (
  id uuid primary key default gen_random_uuid(),
  store_id text not null references public.stores (id) on delete cascade,
  path text not null unique,
  filename text not null,
  mime text not null check (mime in ('image/webp', 'image/png', 'image/jpeg', 'image/avif')),
  bytes integer not null check (bytes > 0 and bytes <= 10485760),
  width integer not null check (width > 0),
  height integer not null check (height > 0),
  alt text not null default '',
  created_by uuid,
  created_at timestamptz not null default now()
);
create index media_store_created on public.media (store_id, created_at desc);

alter table public.media enable row level security;
grant select on public.media to authenticated;
create policy staff_read on public.media for select to authenticated using (public.has_permission(store_id, 'media:read'));

-- ─── RBAC reads for the catalogue's non-public rows ─────────────────────────
create policy rbac_read on public.products for select to authenticated using (public.has_permission(store_id, 'products:read'));
create policy rbac_read on public.product_images for select to authenticated
  using (exists (select 1 from public.products as p where p.id = product_id and public.has_permission(p.store_id, 'products:read')));
create policy rbac_read on public.variants for select to authenticated
  using (exists (select 1 from public.products as p where p.id = product_id and public.has_permission(p.store_id, 'products:read')));
create policy rbac_read on public.inventory_levels for select to authenticated
  using (exists (select 1 from public.variants as v join public.products as p on p.id = v.product_id where v.id = variant_id and public.has_permission(p.store_id, 'inventory:read')));
create policy rbac_read on public.inventory_movements for select to authenticated
  using (exists (select 1 from public.variants as v join public.products as p on p.id = v.product_id where v.id = variant_id and public.has_permission(p.store_id, 'inventory:read')));
