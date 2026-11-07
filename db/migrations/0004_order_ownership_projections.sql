ALTER TABLE `orders` ADD COLUMN `checkout_cart_id` BINARY(16) NULL;
ALTER TABLE `orders` ADD CONSTRAINT `orders_checkout_cart_fk` FOREIGN KEY (`checkout_cart_id`) REFERENCES `carts` (`id`) ON DELETE SET NULL;
ALTER TABLE `order_lines` ADD COLUMN `restocked_quantity` INT NOT NULL DEFAULT 0,
  ADD CONSTRAINT `order_lines_restock_within_quantity` CHECK (`restocked_quantity` >= 0 AND `restocked_quantity` <= `quantity`);
CREATE INDEX `orders_store_total_placed` ON `orders` (`store_id`, `total`, `placed_at`, `id`);

CREATE TABLE IF NOT EXISTS `order_contacts` (
  `order_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `recipient_name` VARCHAR(190) NOT NULL,
  `phone_digits` VARCHAR(40) NOT NULL,
  PRIMARY KEY (`order_id`),
  INDEX `order_contacts_name` (`store_id`, `recipient_name`, `order_id`),
  INDEX `order_contacts_phone` (`store_id`, `phone_digits`, `order_id`),
  CONSTRAINT `order_contacts_order_fk` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`) ON DELETE CASCADE,
  CONSTRAINT `order_contacts_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
