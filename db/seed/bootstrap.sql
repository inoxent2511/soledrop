-- Operating configuration only; safe to repeat, never overwrites merchant configuration.
INSERT IGNORE INTO stores (id, name, default_currency, order_prefix, next_order_number)
VALUES (UNHEX('00000000000040008000000000000001'), 'Sole Drop', 'PKR', 'SD', 10001);
INSERT IGNORE INTO store_metadata (store_id, slug, default_locale)
VALUES (UNHEX('00000000000040008000000000000001'), 'soledrop', 'en');
INSERT IGNORE INTO order_number_sequences (store_id, prefix, next_value)
VALUES (UNHEX('00000000000040008000000000000001'), 'SD', 10001);
INSERT IGNORE INTO exchange_rates (store_id, base, rates)
VALUES (UNHEX('00000000000040008000000000000001'), 'PKR', '{"PKR":1}');
INSERT IGNORE INTO feature_flags (store_id, `key`, description, enabled) VALUES
(UNHEX('00000000000040008000000000000001'), 'b2b-pricing', 'Wholesale pricing for approved trade accounts.', 0),
(UNHEX('00000000000040008000000000000001'), 'multi-currency-display', 'Display approximate converted prices after configuring exchange rates.', 0),
(UNHEX('00000000000040008000000000000001'), 'stripe-payments', 'Card payments through the configured Stripe provider.', 0),
(UNHEX('00000000000040008000000000000001'), 'express-delivery', 'Offer the configured express shipping rate.', 0);
INSERT IGNORE INTO feature_flag_customer_groups (store_id, `key`, position, value)
VALUES (UNHEX('00000000000040008000000000000001'), 'b2b-pricing', 0, 'wholesale');
INSERT IGNORE INTO price_lists (id, store_id, code, currency, priority)
VALUES (UNHEX('50000000000040008000000000000001'), UNHEX('00000000000040008000000000000001'), 'retail-pkr', 'PKR', 0);
