-- Preserve validation limits and add indexed historical references / listing paths.
ALTER TABLE `media` MODIFY `alt` VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE `product_images` MODIFY `alt` VARCHAR(300) NOT NULL DEFAULT '';
ALTER TABLE `faqs` MODIFY `question` VARCHAR(300) NOT NULL;
ALTER TABLE `inventory_reservations` ADD CONSTRAINT `inventory_reservations_cart_fk` FOREIGN KEY (`cart_id`) REFERENCES `carts` (`id`) ON DELETE CASCADE;
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE RESTRICT;
ALTER TABLE `order_lines` ADD CONSTRAINT `order_lines_variant_fk` FOREIGN KEY (`variant_id`) REFERENCES `variants` (`id`) ON DELETE RESTRICT;
CREATE INDEX `products_store_updated` ON `products` (`store_id`, `updated_at`, `id`);
CREATE INDEX `products_store_brand_updated` ON `products` (`store_id`, `brand_id`, `updated_at`, `id`);
CREATE INDEX `products_store_kind_updated` ON `products` (`store_id`, `kind`, `updated_at`, `id`);
CREATE INDEX `customers_store_created` ON `customers` (`store_id`, `created_at`, `id`);
CREATE INDEX `customers_store_group_created` ON `customers` (`store_id`, `customer_group`, `created_at`, `id`);
CREATE INDEX `newsletter_store_consent` ON `newsletter_subscribers` (`store_id`, `consent_at`, `email`);
CREATE INDEX `outbox_store_due` ON `outbox_events` (`store_id`, `status`, `available_at`, `id`);
CREATE INDEX `search_store_query_at` ON `search_queries` (`store_id`, `normalized`, `created_at`);
CREATE INDEX `reservations_cart_variant` ON `inventory_reservations` (`cart_id`, `variant_id`);
CREATE INDEX `idempotency_expiry` ON `idempotency_keys` (`expires_at`);
CREATE INDEX `rate_limits_window` ON `rate_limits` (`window_start`);
CREATE INDEX `sessions_expiry` ON `sessions` (`expires_at`);
