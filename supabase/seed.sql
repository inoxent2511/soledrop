-- Minimal store bootstrap. Products, photos and merchandising are created through the admin.
-- Sample data for isolated QA lives in qa/fixtures/seed.sql and is never applied here.
insert into public.stores (id, name, default_currency, order_prefix, next_order_number)
values ('00000000-0000-4000-8000-000000000001', 'Sole Drop', 'PKR', 'SD', 10001)
on conflict (id) do nothing;

-- Required operating configuration, without sample exchange quotes or enabled integrations.
insert into public.exchange_rates (store_id, base, rates, updated_at)
values ('00000000-0000-4000-8000-000000000001', 'PKR', '{"PKR":1}'::jsonb, clock_timestamp())
on conflict (store_id) do nothing;

insert into public.feature_flags (store_id, key, description, enabled, customer_groups) values
('00000000-0000-4000-8000-000000000001', 'b2b-pricing', 'Wholesale pricing for approved trade accounts.', false, array['wholesale']),
('00000000-0000-4000-8000-000000000001', 'multi-currency-display', 'Display approximate converted prices after configuring exchange rates.', false, null),
('00000000-0000-4000-8000-000000000001', 'stripe-payments', 'Card payments through the configured Stripe provider.', false, null),
('00000000-0000-4000-8000-000000000001', 'express-delivery', 'Offer the configured express shipping rate.', false, null)
on conflict (store_id, key) do nothing;

insert into public.price_lists (id, store_id, code, currency, priority)
values ('50000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000001', 'retail-pkr', 'PKR', 0)
on conflict (id) do nothing;
