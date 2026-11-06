-- Admin A8 (marketing, search, reports). Additive only.

-- Search analytics for the last p_days: totals, top queries (with clicks) and zero-result queries.
create function public.search_report(p_store_id text, p_days integer, p_limit integer)
returns table (searches bigint, zero_result_searches bigint, clicks bigint, top jsonb, zero jsonb)
language sql
stable
set search_path = ''
as $$
  with recent as (
    select normalized, result_count, clicked_slug from public.search_queries
    where store_id = p_store_id and created_at >= now() - make_interval(days => p_days)
  ),
  click_counts as (
    select normalized, count(*) as clicks from recent where clicked_slug is not null group by normalized
  ),
  top_queries as (
    select r.normalized as query, count(*) as count, coalesce(max(c.clicks), 0) as clicks
    from recent as r left join click_counts as c using (normalized)
    where r.clicked_slug is null and r.result_count > 0
    group by r.normalized order by count(*) desc, r.normalized limit p_limit
  ),
  zero_queries as (
    select normalized as query, count(*) as count from recent
    where clicked_slug is null and result_count = 0
    group by normalized order by count(*) desc, normalized limit p_limit
  )
  select
    (select count(*) from recent where clicked_slug is null),
    (select count(*) from recent where clicked_slug is null and result_count = 0),
    (select count(*) from recent where clicked_slug is not null),
    (select coalesce(jsonb_agg(jsonb_build_object('query', query, 'count', count, 'clicks', clicks)), '[]') from top_queries),
    (select coalesce(jsonb_agg(jsonb_build_object('query', query, 'count', count)), '[]') from zero_queries)
$$;

revoke all on function public.search_report(text, integer, integer) from public;
grant execute on function public.search_report(text, integer, integer) to service_role;

-- RBAC staff: search log for search:read, newsletter for marketing:read.
create policy rbac_read on public.search_queries for select to authenticated using (public.has_permission(store_id, 'search:read'));
create policy rbac_read on public.newsletter_subscribers for select to authenticated using (public.has_permission(store_id, 'marketing:read'));
