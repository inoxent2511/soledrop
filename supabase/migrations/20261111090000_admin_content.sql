-- Admin A7 (content pages and FAQs): atomic staff writes. Additive only.

-- Creates or updates a page by slug, renaming when p_previous_slug differs; refuses a stale save.
create function public.save_page(p_store_id text, p_previous_slug text, p_page jsonb, p_expected_updated_at timestamptz)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_current timestamptz;
  v_slug text := p_page ->> 'slug';
begin
  if p_previous_slug is not null then
    select updated_at into v_current from public.pages where store_id = p_store_id and slug = p_previous_slug for update;
    if not found then raise exception 'not_found: Page not found.'; end if;
    if p_expected_updated_at is not null and date_trunc('milliseconds', v_current) <> date_trunc('milliseconds', p_expected_updated_at) then
      raise exception 'conflict: Someone else saved this page since you opened it. Reload to see their changes.';
    end if;
  end if;
  if exists (select 1 from public.pages where store_id = p_store_id and slug = v_slug and slug is distinct from p_previous_slug) then
    raise exception 'conflict: Another page already uses this web address.';
  end if;

  if p_previous_slug is null then
    insert into public.pages (store_id, slug, title, description, blocks, seo, published, updated_at)
    values (p_store_id, v_slug, p_page ->> 'title', coalesce(p_page ->> 'description', ''), coalesce(p_page -> 'blocks', '[]'), coalesce(p_page -> 'seo', '{}'),
      coalesce((p_page ->> 'published')::boolean, false), clock_timestamp());
  else
    update public.pages set
      slug = v_slug, title = p_page ->> 'title', description = coalesce(p_page ->> 'description', ''), blocks = coalesce(p_page -> 'blocks', '[]'),
      seo = coalesce(p_page -> 'seo', '{}'), published = coalesce((p_page ->> 'published')::boolean, false), updated_at = clock_timestamp()
    where store_id = p_store_id and slug = p_previous_slug;
  end if;
end
$$;

-- Positions follow the order of p_ids.
create function public.reorder_faqs(p_store_id text, p_ids uuid[])
returns void
language sql
set search_path = ''
as $$
  update public.faqs as f set position = ids.ordinality - 1
  from unnest(p_ids) with ordinality as ids (id, ordinality)
  where f.id = ids.id and f.store_id = p_store_id
$$;

revoke all on function public.save_page(text, text, jsonb, timestamptz) from public;
revoke all on function public.reorder_faqs(text, uuid[]) from public;
grant execute on function public.save_page(text, text, jsonb, timestamptz) to service_role;
grant execute on function public.reorder_faqs(text, uuid[]) to service_role;

-- RBAC staff read draft pages.
create policy rbac_read on public.pages for select to authenticated using (public.has_permission(store_id, 'content:read'));
