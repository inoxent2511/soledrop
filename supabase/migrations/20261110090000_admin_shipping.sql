-- Admin A5 (promotions, shipping, tax): atomic writes for the staff screens. Additive only.

-- A zone and every rate in one transaction; rates not in p_rates are removed.
create function public.save_shipping_zone(p_store_id text, p_zone jsonb, p_rates jsonb)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_id uuid := (p_zone ->> 'id')::uuid;
begin
  if exists (select 1 from public.shipping_zones where id = v_id and store_id <> p_store_id) then
    raise exception 'not_found: Zone not found.';
  end if;
  insert into public.shipping_zones (id, store_id, name, countries, cities, position)
  values (
    v_id, p_store_id, p_zone ->> 'name',
    array(select jsonb_array_elements_text(coalesce(p_zone -> 'countries', '[]'))),
    array(select lower(jsonb_array_elements_text(coalesce(p_zone -> 'cities', '[]')))),
    coalesce((p_zone ->> 'position')::integer, 0)
  )
  on conflict (id) do update set name = excluded.name, countries = excluded.countries, cities = excluded.cities, position = excluded.position;

  delete from public.shipping_rates where zone_id = v_id;
  insert into public.shipping_rates (zone_id, code, label, amount, free_over, min_days, max_days, cash_on_delivery)
    select v_id, r ->> 'code', r ->> 'label', (r ->> 'amount')::bigint, (r ->> 'free_over')::bigint,
      (r ->> 'min_days')::integer, (r ->> 'max_days')::integer, coalesce((r ->> 'cash_on_delivery')::boolean, false)
    from jsonb_array_elements(coalesce(p_rates, '[]')) as rates (r);
end
$$;

-- The store's tax table, replaced as a whole (it is a handful of rows).
create function public.replace_tax_rates(p_store_id text, p_rates jsonb)
returns void
language plpgsql
set search_path = ''
as $$
begin
  delete from public.tax_rates where store_id = p_store_id;
  insert into public.tax_rates (store_id, country, province, label, basis_points, inclusive)
    select p_store_id, r ->> 'country', r ->> 'province', r ->> 'label', (r ->> 'basis_points')::integer, coalesce((r ->> 'inclusive')::boolean, true)
    from jsonb_array_elements(coalesce(p_rates, '[]')) as rates (r);
end
$$;

revoke all on function public.save_shipping_zone(text, jsonb, jsonb) from public;
revoke all on function public.replace_tax_rates(text, jsonb) from public;
grant execute on function public.save_shipping_zone(text, jsonb, jsonb) to service_role;
grant execute on function public.replace_tax_rates(text, jsonb) to service_role;

-- RBAC staff read promotions and their redemptions.
create policy rbac_read on public.promotions for select to authenticated using (public.has_permission(store_id, 'promotions:read'));
create policy rbac_read on public.promotion_redemptions for select to authenticated
  using (exists (select 1 from public.promotions as p where p.id = promotion_id and public.has_permission(p.store_id, 'promotions:read')));
