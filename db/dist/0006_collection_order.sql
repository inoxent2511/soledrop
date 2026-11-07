
-- 0006_collection_order.sql / SHA256 437deb05625c878f8eff25a51d490c556ceaffec8d63bf778b0c80b7a0ceeeb5
-- Independent ordering within a collection and of memberships on a product.
ALTER TABLE `collection_products` ADD COLUMN `product_position` INT NOT NULL DEFAULT 0 CHECK (`product_position` >= 0);
CREATE INDEX `collection_products_membership_order` ON `collection_products` (`product_id`, `product_position`);

INSERT INTO schema_migrations (name, checksum) VALUES ('0006_collection_order.sql', '437deb05625c878f8eff25a51d490c556ceaffec8d63bf778b0c80b7a0ceeeb5') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
