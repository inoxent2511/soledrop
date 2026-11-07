-- Independent ordering within a collection and of memberships on a product.
ALTER TABLE `collection_products` ADD COLUMN `product_position` INT NOT NULL DEFAULT 0 CHECK (`product_position` >= 0);
CREATE INDEX `collection_products_membership_order` ON `collection_products` (`product_id`, `product_position`);
