-- Import into an empty selected database; take a backup first.
-- Reimports of CREATE TABLE are guarded. Existing ALTER migrations require ledger-aware runner.
CREATE TABLE IF NOT EXISTS schema_migrations (name VARCHAR(190) NOT NULL PRIMARY KEY, checksum CHAR(64) NOT NULL, applied_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 0001_core.sql / SHA256 195be97fe8b91e7a53efa17262d130be593d8f6c5e9992a3685597eeb367180b
-- Common MySQL >=8.0.16 / MariaDB >=10.6 schema. Forward-only; no triggers.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `audit_log` (
  `id` BINARY(16) NOT NULL,
  `actor` VARCHAR(190) NOT NULL,
  `action` VARCHAR(190) NOT NULL,
  `entity` VARCHAR(190) NOT NULL,
  `entity_id` VARCHAR(190) NOT NULL,
  `before` JSON NULL,
  CONSTRAINT `audit_log_before_json_valid` CHECK (JSON_VALID(`before`)),
  `after` JSON NULL,
  CONSTRAINT `audit_log_after_json_valid` CHECK (JSON_VALID(`after`)),
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `store_id` BINARY(16) NULL,
  `actor_role` VARCHAR(190) NULL,
  `ip` VARCHAR(190) NULL,
  `user_agent` TEXT NULL,
  `request_id` VARCHAR(190) NULL,
  `reason` TEXT NULL,
  PRIMARY KEY (`id`),
  INDEX `audit_log_actor` (`store_id`, `actor`, `at` DESC),
  INDEX `audit_log_entity` (`entity`, `entity_id`, `at`),
  INDEX `audit_log_store_at` (`store_id`, `at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `idempotency_keys` (
  `key` VARCHAR(190) NOT NULL,
  `status` INT NOT NULL,
  `body` JSON NULL,
  CONSTRAINT `idempotency_keys_body_json_valid` CHECK (JSON_VALID(`body`)),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `permissions` (
  `key` VARCHAR(190) NOT NULL,
  `label` VARCHAR(190) NOT NULL,
  `group` VARCHAR(190) NOT NULL,
  `sensitive` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `permissions_sensitive_boolean` CHECK (`sensitive` IN (0, 1)),
  CONSTRAINT `permissions_key_check` CHECK ((`key` REGEXP '^[a-z_]+:[a-z_]+$')),
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `rate_limits` (
  `key` VARCHAR(190) NOT NULL,
  `window_start` DATETIME(3) NOT NULL,
  `count` INT NOT NULL,
  PRIMARY KEY (`key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `stores` (
  `id` BINARY(16) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `default_currency` CHAR(3) NOT NULL DEFAULT 'PKR',
  CONSTRAINT `stores_default_currency_enum` CHECK (`default_currency` IN ('PKR', 'USD', 'AED', 'GBP')),
  `order_prefix` VARCHAR(190) NOT NULL DEFAULT 'SD',
  `next_order_number` BIGINT NOT NULL DEFAULT 10001,
  CONSTRAINT `stores_next_order_number_safe` CHECK (`next_order_number` BETWEEN -9007199254740991 AND 9007199254740991),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `stores_next_order_number_check` CHECK ((`next_order_number` > 0)),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `attribute_definitions` (
  `store_id` BINARY(16) NOT NULL,
  `code` VARCHAR(190) NOT NULL,
  `label` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `scope` VARCHAR(190) NOT NULL,
  `options` JSON NULL,
  CONSTRAINT `attribute_definitions_options_json_valid` CHECK (JSON_VALID(`options`)),
  `filterable` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `attribute_definitions_filterable_boolean` CHECK (`filterable` IN (0, 1)),
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`store_id`, `code`),
  CONSTRAINT `attribute_definitions_scope_check` CHECK ((`scope` IN ('product', 'variant'))),
  CONSTRAINT `attribute_definitions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `attribute_definitions_type_check` CHECK ((`type` IN ('text', 'number', 'boolean', 'enum', 'multi_enum')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `brands` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  CONSTRAINT `brands_slug_normalized` CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `name` VARCHAR(190) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `brands_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `brands_store_id_slug_key` UNIQUE (`store_id`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collections` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  CONSTRAINT `collections_slug_normalized` CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `title` VARCHAR(190) NOT NULL,
  `headline` JSON NOT NULL DEFAULT ('["", ""]'),
  CONSTRAINT `collections_headline_json_valid` CHECK (JSON_VALID(`headline`)),
  `description` TEXT NOT NULL DEFAULT (''),
  `kind` VARCHAR(190) NOT NULL,
  `rules` JSON NULL,
  CONSTRAINT `collections_rules_json_valid` CHECK (JSON_VALID(`rules`)),
  `image` JSON NULL,
  CONSTRAINT `collections_image_json_valid` CHECK (JSON_VALID(`image`)),
  `position` INT NOT NULL DEFAULT 0,
  `seo` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `collections_seo_json_valid` CHECK (JSON_VALID(`seo`)),
  CONSTRAINT `collections_headline_check` CHECK ((JSON_TYPE(`headline`) = 'ARRAY')),
  CONSTRAINT `collections_kind_check` CHECK ((`kind` IN ('manual', 'rule'))),
  PRIMARY KEY (`id`),
  CONSTRAINT `collections_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `collections_store_id_slug_key` UNIQUE (`store_id`, `slug`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `contact_messages` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `contact_messages_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `order_number` VARCHAR(190) NULL,
  `message` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `contact_messages_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `custom_field_definitions` (
  `store_id` BINARY(16) NOT NULL,
  `entity` VARCHAR(190) NOT NULL,
  `code` VARCHAR(190) NOT NULL,
  `label` VARCHAR(190) NOT NULL,
  `type` VARCHAR(190) NOT NULL,
  `required` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `custom_field_definitions_required_boolean` CHECK (`required` IN (0, 1)),
  `visible_on_storefront` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `custom_field_definitions_visible_on_storefront_boolean` CHECK (`visible_on_storefront` IN (0, 1)),
  CONSTRAINT `custom_field_definitions_entity_check` CHECK ((`entity` IN ('product', 'order', 'customer'))),
  PRIMARY KEY (`store_id`, `entity`, `code`),
  CONSTRAINT `custom_field_definitions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `custom_field_definitions_type_check` CHECK ((`type` IN ('text', 'number', 'boolean', 'date', 'url')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customers` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `customers_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `password_hash` VARCHAR(190) NOT NULL,
  `full_name` VARCHAR(190) NOT NULL,
  `phone` VARCHAR(190) NULL,
  `customer_group` VARCHAR(190) NOT NULL DEFAULT 'retail',
  CONSTRAINT `customers_customer_group_enum` CHECK (`customer_group` IN ('retail', 'wholesale')),
  `marketing_opt_in` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `customers_marketing_opt_in_boolean` CHECK (`marketing_opt_in` IN (0, 1)),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `deletion_requested_at` DATETIME(3) NULL,
  CONSTRAINT `customers_email_check` CHECK ((`email` = lower(`email`))),
  PRIMARY KEY (`id`),
  CONSTRAINT `customers_store_id_email_key` UNIQUE (`store_id`, `email`),
  CONSTRAINT `customers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `exchange_rates` (
  `store_id` BINARY(16) NOT NULL,
  `base` CHAR(3) NOT NULL,
  CONSTRAINT `exchange_rates_base_enum` CHECK (`base` IN ('PKR', 'USD', 'AED', 'GBP')),
  `rates` JSON NOT NULL,
  CONSTRAINT `exchange_rates_rates_json_valid` CHECK (JSON_VALID(`rates`)),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`store_id`),
  CONSTRAINT `exchange_rates_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `faqs` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `category` VARCHAR(190) NOT NULL,
  `question` VARCHAR(190) NOT NULL,
  `answer` TEXT NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `faqs_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `feature_flags` (
  `store_id` BINARY(16) NOT NULL,
  `key` VARCHAR(190) NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `enabled` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `feature_flags_enabled_boolean` CHECK (`enabled` IN (0, 1)),
  PRIMARY KEY (`store_id`, `key`),
  CONSTRAINT `feature_flags_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `path` VARCHAR(512) NOT NULL,
  `filename` VARCHAR(190) NOT NULL,
  `mime` VARCHAR(190) NOT NULL,
  `bytes` INT NOT NULL,
  `width` INT NOT NULL,
  `height` INT NOT NULL,
  `alt` VARCHAR(190) NOT NULL DEFAULT '',
  `created_by` BINARY(16) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `media_bytes_check` CHECK (((`bytes` > 0) AND (`bytes` <= 10485760))),
  CONSTRAINT `media_height_check` CHECK ((`height` > 0)),
  CONSTRAINT `media_mime_check` CHECK ((`mime` IN ('image/webp', 'image/png', 'image/jpeg', 'image/avif'))),
  CONSTRAINT `media_path_key` UNIQUE (`path`),
  PRIMARY KEY (`id`),
  CONSTRAINT `media_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `media_width_check` CHECK ((`width` > 0)),
  INDEX `media_store_created` (`store_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `newsletter_subscribers` (
  `store_id` BINARY(16) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `newsletter_subscribers_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `source` VARCHAR(190) NOT NULL,
  `status` VARCHAR(190) NOT NULL DEFAULT 'subscribed',
  `consent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `newsletter_subscribers_email_check` CHECK ((`email` = lower(`email`))),
  PRIMARY KEY (`store_id`, `email`),
  CONSTRAINT `newsletter_subscribers_status_check` CHECK ((`status` IN ('subscribed', 'unsubscribed'))),
  CONSTRAINT `newsletter_subscribers_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `outbox_events` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `topic` VARCHAR(190) NOT NULL,
  `payload` JSON NOT NULL,
  CONSTRAINT `outbox_events_payload_json_valid` CHECK (JSON_VALID(`payload`)),
  `status` VARCHAR(190) NOT NULL DEFAULT 'pending',
  CONSTRAINT `outbox_events_status_enum` CHECK (`status` IN ('pending', 'delivered', 'failed')),
  `attempts` INT NOT NULL DEFAULT 0,
  `available_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `delivered_at` DATETIME(3) NULL,
  `last_error` TEXT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `outbox_events_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  INDEX `outbox_due` (`status`, `available_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `pages` (
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  CONSTRAINT `pages_slug_normalized` CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `title` VARCHAR(190) NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `blocks` JSON NOT NULL DEFAULT ('[]'),
  CONSTRAINT `pages_blocks_json_valid` CHECK (JSON_VALID(`blocks`)),
  `seo` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `pages_seo_json_valid` CHECK (JSON_VALID(`seo`)),
  `published` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `pages_published_boolean` CHECK (`published` IN (0, 1)),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`store_id`, `slug`),
  CONSTRAINT `pages_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `price_lists` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `code` VARCHAR(190) NOT NULL,
  `currency` CHAR(3) NOT NULL,
  CONSTRAINT `price_lists_currency_enum` CHECK (`currency` IN ('PKR', 'USD', 'AED', 'GBP')),
  `customer_group` VARCHAR(190) NULL,
  CONSTRAINT `price_lists_customer_group_enum` CHECK (`customer_group` IN ('retail', 'wholesale')),
  `priority` INT NOT NULL DEFAULT 0,
  `starts_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  CONSTRAINT `price_lists_check` CHECK (((`ends_at` IS NULL) OR (`starts_at` IS NULL) OR (`ends_at` > `starts_at`))),
  PRIMARY KEY (`id`),
  CONSTRAINT `price_lists_store_id_code_key` UNIQUE (`store_id`, `code`),
  CONSTRAINT `price_lists_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promotions` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `code` VARCHAR(190) NULL,
  `title` VARCHAR(190) NOT NULL,
  `conditions` JSON NOT NULL DEFAULT ('[]'),
  CONSTRAINT `promotions_conditions_json_valid` CHECK (JSON_VALID(`conditions`)),
  `actions` JSON NOT NULL DEFAULT ('[]'),
  CONSTRAINT `promotions_actions_json_valid` CHECK (JSON_VALID(`actions`)),
  `starts_at` DATETIME(3) NULL,
  `ends_at` DATETIME(3) NULL,
  `usage_limit` INT NULL,
  `per_customer_limit` INT NULL,
  `times_used` INT NOT NULL DEFAULT 0,
  `active` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `promotions_active_boolean` CHECK (`active` IN (0, 1)),
  `combinable` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `promotions_combinable_boolean` CHECK (`combinable` IN (0, 1)),
  CONSTRAINT `promotions_per_customer_limit_check` CHECK (((`per_customer_limit` IS NULL) OR (`per_customer_limit` > 0))),
  PRIMARY KEY (`id`),
  CONSTRAINT `promotions_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promotions_times_used_check` CHECK ((`times_used` >= 0)),
  CONSTRAINT `promotions_usage_limit_check` CHECK (((`usage_limit` IS NULL) OR (`usage_limit` > 0))),
  CONSTRAINT `promotions_usage_within_limit` CHECK (((`usage_limit` IS NULL) OR (`times_used` <= `usage_limit`))),
  UNIQUE INDEX `promotions_store_code` (`store_id`, `code`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `roles` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `key` VARCHAR(190) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `description` TEXT NOT NULL DEFAULT (''),
  `is_system` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `roles_is_system_boolean` CHECK (`is_system` IN (0, 1)),
  `refund_limit` BIGINT NULL,
  CONSTRAINT `roles_refund_limit_safe` CHECK (`refund_limit` BETWEEN -9007199254740991 AND 9007199254740991),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `roles_key_check` CHECK ((`key` REGEXP '^[a-z0-9_]{2,40}$')),
  CONSTRAINT `roles_name_check` CHECK (((CHAR_LENGTH(`name`) >= 1) AND (CHAR_LENGTH(`name`) <= 60))),
  PRIMARY KEY (`id`),
  CONSTRAINT `roles_refund_limit_check` CHECK (((`refund_limit` IS NULL) OR (`refund_limit` >= 0))),
  CONSTRAINT `roles_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `roles_store_id_key_key` UNIQUE (`store_id`, `key`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_queries` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `query` VARCHAR(190) NOT NULL,
  `normalized` VARCHAR(190) NOT NULL,
  `result_count` INT NULL,
  `clicked_slug` VARCHAR(190) NULL,
  `source` VARCHAR(190) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `search_queries_check` CHECK (((`result_count` IS NULL) <> (`clicked_slug` IS NULL))),
  CONSTRAINT `search_queries_normalized_check` CHECK (((CHAR_LENGTH(`normalized`) >= 1) AND (CHAR_LENGTH(`normalized`) <= 100))),
  PRIMARY KEY (`id`),
  CONSTRAINT `search_queries_query_check` CHECK (((CHAR_LENGTH(`query`) >= 1) AND (CHAR_LENGTH(`query`) <= 100))),
  CONSTRAINT `search_queries_result_count_check` CHECK ((`result_count` >= 0)),
  CONSTRAINT `search_queries_source_check` CHECK ((`source` IN ('overlay', 'page'))),
  CONSTRAINT `search_queries_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  INDEX `search_queries_trending_idx` (`store_id`, `clicked_slug`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_synonyms` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `term` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `search_synonyms_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `search_synonyms_store_id_term_key` UNIQUE (`store_id`, `term`),
  CONSTRAINT `search_synonyms_term_check` CHECK ((CHAR_LENGTH(TRIM(`term`)) > 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipping_zones` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `name` VARCHAR(190) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `shipping_zones_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_invites` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `staff_invites_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `role_key` VARCHAR(190) NOT NULL,
  `token_hash` VARCHAR(190) NOT NULL,
  `invited_by` BINARY(16) NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `accepted_at` DATETIME(3) NULL,
  `revoked_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `staff_invites_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `staff_invites_token_hash_key` UNIQUE (`token_hash`),
  INDEX `staff_invites_store` (`store_id`, `created_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_members` (
  `user_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `role` VARCHAR(190) NULL,
  CONSTRAINT `staff_members_role_enum` CHECK (`role` IN ('owner', 'manager', 'fulfilment', 'support')),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `email` VARCHAR(254) NULL,
  CONSTRAINT `staff_members_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `display_name` VARCHAR(190) NOT NULL DEFAULT '',
  `status` VARCHAR(190) NOT NULL DEFAULT 'active',
  `password_hash` VARCHAR(190) NULL,
  `totp_secret` TEXT NULL,
  `totp_enabled_at` DATETIME(3) NULL,
  `totp_last_step` BIGINT NULL,
  CONSTRAINT `staff_members_totp_last_step_safe` CHECK (`totp_last_step` BETWEEN -9007199254740991 AND 9007199254740991),
  `failed_logins` INT NOT NULL DEFAULT 0,
  `locked_until` DATETIME(3) NULL,
  `last_seen_at` DATETIME(3) NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `staff_members_failed_logins_check` CHECK ((`failed_logins` >= 0)),
  PRIMARY KEY (`user_id`, `store_id`),
  CONSTRAINT `staff_members_status_check` CHECK ((`status` IN ('invited', 'active', 'suspended'))),
  CONSTRAINT `staff_members_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  UNIQUE INDEX `staff_members_store_email` (`store_id`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `storefront_content` (
  `store_id` BINARY(16) NOT NULL,
  `content` JSON NOT NULL,
  CONSTRAINT `storefront_content_content_json_valid` CHECK (JSON_VALID(`content`)),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `storefront_content_content_check` CHECK ((JSON_TYPE(`content`) = 'OBJECT')),
  PRIMARY KEY (`store_id`),
  CONSTRAINT `storefront_content_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `tax_rates` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `country` VARCHAR(190) NOT NULL,
  `province` VARCHAR(190) NULL,
  `label` VARCHAR(190) NOT NULL,
  `basis_points` INT NOT NULL,
  `inclusive` TINYINT(1) NOT NULL DEFAULT 1,
  CONSTRAINT `tax_rates_inclusive_boolean` CHECK (`inclusive` IN (0, 1)),
  CONSTRAINT `tax_rates_basis_points_check` CHECK (((`basis_points` >= 0) AND (`basis_points` <= 10000))),
  PRIMARY KEY (`id`),
  CONSTRAINT `tax_rates_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `addresses` (
  `id` BINARY(16) NOT NULL,
  `customer_id` BINARY(16) NOT NULL,
  `full_name` VARCHAR(190) NOT NULL,
  `phone` VARCHAR(190) NOT NULL,
  `line1` VARCHAR(190) NOT NULL,
  `line2` VARCHAR(190) NULL,
  `city` VARCHAR(190) NOT NULL,
  `province` VARCHAR(190) NOT NULL,
  `postal_code` VARCHAR(190) NULL,
  `country` VARCHAR(190) NOT NULL DEFAULT 'PK',
  `is_default` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `addresses_is_default_boolean` CHECK (`is_default` IN (0, 1)),
  CONSTRAINT `addresses_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  `default_customer` BINARY(16) GENERATED ALWAYS AS (CASE WHEN `is_default` = 1 THEN `customer_id` ELSE NULL END) VIRTUAL,
  UNIQUE INDEX `addresses_one_default` (`default_customer`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `carts` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `token_hash` VARCHAR(190) NOT NULL,
  `customer_id` BINARY(16) NULL,
  `currency` CHAR(3) NOT NULL DEFAULT 'PKR',
  CONSTRAINT `carts_currency_enum` CHECK (`currency` IN ('PKR', 'USD', 'AED', 'GBP')),
  `status` VARCHAR(190) NOT NULL DEFAULT 'active',
  CONSTRAINT `carts_status_enum` CHECK (`status` IN ('active', 'converted', 'merged')),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `carts_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `carts_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  INDEX `carts_customer` (`store_id`, `customer_id`, `status`),
  INDEX `carts_token` (`store_id`, `token_hash`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `orders` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `number` VARCHAR(190) NOT NULL,
  `customer_id` BINARY(16) NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `orders_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `phone` VARCHAR(190) NOT NULL,
  `status` VARCHAR(190) NOT NULL,
  CONSTRAINT `orders_status_enum` CHECK (`status` IN ('pending_payment', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'returned')),
  `payment_status` VARCHAR(190) NOT NULL DEFAULT 'unpaid',
  CONSTRAINT `orders_payment_status_enum` CHECK (`payment_status` IN ('unpaid', 'authorized', 'paid', 'partially_refunded', 'refunded', 'failed')),
  `fulfillment_status` VARCHAR(190) NOT NULL DEFAULT 'unfulfilled',
  CONSTRAINT `orders_fulfillment_status_enum` CHECK (`fulfillment_status` IN ('unfulfilled', 'fulfilled', 'returned')),
  `currency` CHAR(3) NOT NULL,
  CONSTRAINT `orders_currency_enum` CHECK (`currency` IN ('PKR', 'USD', 'AED', 'GBP')),
  `subtotal` BIGINT NOT NULL,
  CONSTRAINT `orders_subtotal_safe` CHECK (`subtotal` BETWEEN -9007199254740991 AND 9007199254740991),
  `discount_total` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `orders_discount_total_safe` CHECK (`discount_total` BETWEEN -9007199254740991 AND 9007199254740991),
  `shipping_total` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `orders_shipping_total_safe` CHECK (`shipping_total` BETWEEN -9007199254740991 AND 9007199254740991),
  `tax_total` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `orders_tax_total_safe` CHECK (`tax_total` BETWEEN -9007199254740991 AND 9007199254740991),
  `tax_included` TINYINT(1) NOT NULL,
  CONSTRAINT `orders_tax_included_boolean` CHECK (`tax_included` IN (0, 1)),
  `total` BIGINT NOT NULL,
  CONSTRAINT `orders_total_safe` CHECK (`total` BETWEEN -9007199254740991 AND 9007199254740991),
  `refunded_total` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `orders_refunded_total_safe` CHECK (`refunded_total` BETWEEN -9007199254740991 AND 9007199254740991),
  `shipping_address` JSON NOT NULL,
  CONSTRAINT `orders_shipping_address_json_valid` CHECK (JSON_VALID(`shipping_address`)),
  `shipping_method` JSON NOT NULL,
  CONSTRAINT `orders_shipping_method_json_valid` CHECK (JSON_VALID(`shipping_method`)),
  `payment_method` VARCHAR(190) NOT NULL,
  `idempotency_key` VARCHAR(190) NOT NULL,
  `access_token_hash` VARCHAR(190) NOT NULL,
  `custom_fields` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `orders_custom_fields_json_valid` CHECK (JSON_VALID(`custom_fields`)),
  `note` TEXT NULL,
  `tracking_number` VARCHAR(190) NULL,
  `history` JSON NOT NULL DEFAULT ('[]'),
  CONSTRAINT `orders_history_json_valid` CHECK (JSON_VALID(`history`)),
  `placed_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `orders_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  CONSTRAINT `orders_discount_total_check` CHECK ((`discount_total` >= 0)),
  PRIMARY KEY (`id`),
  CONSTRAINT `orders_refund_within_total` CHECK ((`refunded_total` <= `total`)),
  CONSTRAINT `orders_refunded_total_check` CHECK ((`refunded_total` >= 0)),
  CONSTRAINT `orders_shipping_total_check` CHECK ((`shipping_total` >= 0)),
  CONSTRAINT `orders_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`),
  CONSTRAINT `orders_store_id_idempotency_key_key` UNIQUE (`store_id`, `idempotency_key`),
  CONSTRAINT `orders_store_id_number_key` UNIQUE (`store_id`, `number`),
  CONSTRAINT `orders_subtotal_check` CHECK ((`subtotal` >= 0)),
  CONSTRAINT `orders_tax_total_check` CHECK ((`tax_total` >= 0)),
  CONSTRAINT `orders_total_check` CHECK ((`total` >= 0)),
  INDEX `orders_customer` (`store_id`, `customer_id`, `placed_at` DESC),
  INDEX `orders_email` (`store_id`, `email`),
  INDEX `orders_store_payment` (`store_id`, `payment_status`, `placed_at` DESC),
  INDEX `orders_store_placed` (`store_id`, `placed_at` DESC),
  INDEX `orders_store_status` (`store_id`, `status`, `placed_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `password_resets` (
  `token_hash` VARCHAR(190) NOT NULL,
  `customer_id` BINARY(16) NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  CONSTRAINT `password_resets_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`token_hash`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `products` (
  `id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  CONSTRAINT `products_slug_normalized` CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `title` VARCHAR(190) NOT NULL,
  `brand_id` BINARY(16) NOT NULL,
  `kind` VARCHAR(190) NOT NULL,
  CONSTRAINT `products_kind_enum` CHECK (`kind` IN ('new', 'preloved')),
  `gender` VARCHAR(190) NOT NULL,
  CONSTRAINT `products_gender_enum` CHECK (`gender` IN ('men', 'women', 'kids', 'unisex')),
  `status` VARCHAR(190) NOT NULL DEFAULT 'draft',
  CONSTRAINT `products_status_enum` CHECK (`status` IN ('draft', 'active', 'archived')),
  `description` TEXT NOT NULL DEFAULT (''),
  `condition_grade` VARCHAR(190) NULL,
  CONSTRAINT `products_condition_grade_enum` CHECK (`condition_grade` IN ('like-new', 'premium', 'excellent', 'very-good', 'minor-issue')),
  `condition_notes` TEXT NULL,
  `attributes` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `products_attributes_json_valid` CHECK (JSON_VALID(`attributes`)),
  `custom_fields` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `products_custom_fields_json_valid` CHECK (JSON_VALID(`custom_fields`)),
  `position` INT NOT NULL DEFAULT 0,
  `published_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `seo` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `products_seo_json_valid` CHECK (JSON_VALID(`seo`)),
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `products_brand_id_fkey` FOREIGN KEY (`brand_id`) REFERENCES `brands`(`id`),
  CONSTRAINT `products_check` CHECK (((`kind` = 'preloved') = (`condition_grade` IS NOT NULL))),
  PRIMARY KEY (`id`),
  CONSTRAINT `products_store_id_fkey` FOREIGN KEY (`store_id`) REFERENCES `stores`(`id`) ON DELETE CASCADE,
  CONSTRAINT `products_store_id_slug_key` UNIQUE (`store_id`, `slug`),
  INDEX `products_store_status_position` (`store_id`, `status`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `role_permissions` (
  `role_id` BINARY(16) NOT NULL,
  `permission` VARCHAR(190) NOT NULL,
  CONSTRAINT `role_permissions_permission_fkey` FOREIGN KEY (`permission`) REFERENCES `permissions`(`key`) ON DELETE CASCADE,
  PRIMARY KEY (`role_id`, `permission`),
  CONSTRAINT `role_permissions_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `sessions` (
  `token_hash` VARCHAR(190) NOT NULL,
  `customer_id` BINARY(16) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  CONSTRAINT `sessions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`token_hash`),
  INDEX `sessions_customer` (`customer_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `shipping_rates` (
  `id` BINARY(16) NOT NULL,
  `zone_id` BINARY(16) NOT NULL,
  `code` VARCHAR(190) NOT NULL,
  `label` VARCHAR(190) NOT NULL,
  `amount` BIGINT NOT NULL,
  CONSTRAINT `shipping_rates_amount_safe` CHECK (`amount` BETWEEN -9007199254740991 AND 9007199254740991),
  `free_over` BIGINT NULL,
  CONSTRAINT `shipping_rates_free_over_safe` CHECK (`free_over` BETWEEN -9007199254740991 AND 9007199254740991),
  `min_days` INT NOT NULL,
  `max_days` INT NOT NULL,
  `cash_on_delivery` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `shipping_rates_cash_on_delivery_boolean` CHECK (`cash_on_delivery` IN (0, 1)),
  CONSTRAINT `shipping_rates_amount_check` CHECK ((`amount` >= 0)),
  CONSTRAINT `shipping_rates_check` CHECK ((`max_days` >= `min_days`)),
  CONSTRAINT `shipping_rates_free_over_check` CHECK (((`free_over` IS NULL) OR (`free_over` > 0))),
  CONSTRAINT `shipping_rates_min_days_check` CHECK ((`min_days` >= 0)),
  PRIMARY KEY (`id`),
  CONSTRAINT `shipping_rates_zone_id_code_key` UNIQUE (`zone_id`, `code`),
  CONSTRAINT `shipping_rates_zone_id_fkey` FOREIGN KEY (`zone_id`) REFERENCES `shipping_zones`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_roles` (
  `user_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `role_id` BINARY(16) NOT NULL,
  PRIMARY KEY (`user_id`, `store_id`, `role_id`),
  CONSTRAINT `staff_roles_role_id_fkey` FOREIGN KEY (`role_id`) REFERENCES `roles`(`id`) ON DELETE RESTRICT,
  CONSTRAINT `staff_roles_user_id_store_id_fkey` FOREIGN KEY (`user_id`, `store_id`) REFERENCES `staff_members`(`user_id`, `store_id`) ON DELETE CASCADE,
  INDEX `staff_roles_role` (`role_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `staff_sessions` (
  `id` BINARY(16) NOT NULL,
  `user_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `token_hash` VARCHAR(190) NOT NULL,
  `aal` INT NOT NULL,
  `mfa_at` DATETIME(3) NULL,
  `ip` VARCHAR(190) NULL,
  `user_agent` TEXT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `last_seen_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `expires_at` DATETIME(3) NOT NULL,
  `revoked_at` DATETIME(3) NULL,
  CONSTRAINT `staff_sessions_aal_check` CHECK ((`aal` IN (1, 2))),
  PRIMARY KEY (`id`),
  CONSTRAINT `staff_sessions_token_hash_key` UNIQUE (`token_hash`),
  CONSTRAINT `staff_sessions_user_id_store_id_fkey` FOREIGN KEY (`user_id`, `store_id`) REFERENCES `staff_members`(`user_id`, `store_id`) ON DELETE CASCADE,
  INDEX `staff_sessions_member` (`store_id`, `user_id`, `last_seen_at` DESC)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `webhook_deliveries` (
  `id` BINARY(16) NOT NULL,
  `event_id` BINARY(16) NOT NULL,
  `endpoint` VARCHAR(512) NOT NULL,
  `status` VARCHAR(190) NOT NULL,
  `response_status` INT NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `webhook_deliveries_event_id_fkey` FOREIGN KEY (`event_id`) REFERENCES `outbox_events`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  CONSTRAINT `webhook_deliveries_status_check` CHECK ((`status` IN ('delivered', 'failed')))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `collection_products` (
  `collection_id` BINARY(16) NOT NULL,
  `product_id` BINARY(16) NOT NULL,
  `position` INT NOT NULL DEFAULT 0,
  CONSTRAINT `collection_products_collection_id_fkey` FOREIGN KEY (`collection_id`) REFERENCES `collections`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`collection_id`, `product_id`),
  CONSTRAINT `collection_products_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  INDEX `collection_products_product` (`product_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_lines` (
  `id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `variant_id` BINARY(16) NOT NULL,
  `product_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  CONSTRAINT `order_lines_slug_normalized` CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `title` VARCHAR(190) NOT NULL,
  `brand` VARCHAR(190) NOT NULL,
  `kind` VARCHAR(190) NOT NULL,
  CONSTRAINT `order_lines_kind_enum` CHECK (`kind` IN ('new', 'preloved')),
  `condition` VARCHAR(190) NULL,
  CONSTRAINT `order_lines_condition_enum` CHECK (`condition` IN ('like-new', 'premium', 'excellent', 'very-good', 'minor-issue')),
  `size` JSON NOT NULL,
  CONSTRAINT `order_lines_size_json_valid` CHECK (JSON_VALID(`size`)),
  `image_url` VARCHAR(512) NOT NULL,
  `sku` VARCHAR(190) NOT NULL,
  `quantity` INT NOT NULL,
  `unit_price` BIGINT NOT NULL,
  CONSTRAINT `order_lines_unit_price_safe` CHECK (`unit_price` BETWEEN -9007199254740991 AND 9007199254740991),
  `compare_at` BIGINT NULL,
  CONSTRAINT `order_lines_compare_at_safe` CHECK (`compare_at` BETWEEN -9007199254740991 AND 9007199254740991),
  `discount` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `order_lines_discount_safe` CHECK (`discount` BETWEEN -9007199254740991 AND 9007199254740991),
  `tax` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `order_lines_tax_safe` CHECK (`tax` BETWEEN -9007199254740991 AND 9007199254740991),
  `total` BIGINT NOT NULL,
  CONSTRAINT `order_lines_total_safe` CHECK (`total` BETWEEN -9007199254740991 AND 9007199254740991),
  `refunded_quantity` INT NOT NULL DEFAULT 0,
  `position` INT NOT NULL DEFAULT 0,
  CONSTRAINT `order_lines_discount_check` CHECK ((`discount` >= 0)),
  CONSTRAINT `order_lines_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  CONSTRAINT `order_lines_quantity_check` CHECK ((`quantity` > 0)),
  CONSTRAINT `order_lines_refund_within_quantity` CHECK ((`refunded_quantity` <= `quantity`)),
  CONSTRAINT `order_lines_refunded_quantity_check` CHECK ((`refunded_quantity` >= 0)),
  CONSTRAINT `order_lines_tax_check` CHECK ((`tax` >= 0)),
  CONSTRAINT `order_lines_total_check` CHECK ((`total` >= 0)),
  CONSTRAINT `order_lines_unit_price_check` CHECK ((`unit_price` >= 0)),
  INDEX `order_lines_image_url` (`image_url`, `order_id`),
  INDEX `order_lines_order` (`order_id`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_notes` (
  `id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `author` BINARY(16) NOT NULL,
  `author_name` VARCHAR(190) NOT NULL,
  `body` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `order_notes_body_check` CHECK (((CHAR_LENGTH(`body`) >= 1) AND (CHAR_LENGTH(`body`) <= 2000))),
  CONSTRAINT `order_notes_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  INDEX `order_notes_order` (`order_id`, `created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `payments` (
  `id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `provider` VARCHAR(190) NOT NULL,
  `status` VARCHAR(190) NOT NULL,
  CONSTRAINT `payments_status_enum` CHECK (`status` IN ('pending', 'authorized', 'captured', 'failed', 'refunded', 'partially_refunded')),
  `amount` BIGINT NOT NULL,
  CONSTRAINT `payments_amount_safe` CHECK (`amount` BETWEEN -9007199254740991 AND 9007199254740991),
  `refunded_amount` BIGINT NOT NULL DEFAULT 0,
  CONSTRAINT `payments_refunded_amount_safe` CHECK (`refunded_amount` BETWEEN -9007199254740991 AND 9007199254740991),
  `currency` CHAR(3) NOT NULL,
  CONSTRAINT `payments_currency_enum` CHECK (`currency` IN ('PKR', 'USD', 'AED', 'GBP')),
  `provider_ref` VARCHAR(190) NULL,
  `idempotency_key` VARCHAR(190) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `payments_amount_check` CHECK ((`amount` >= 0)),
  CONSTRAINT `payments_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  CONSTRAINT `payments_order_id_idempotency_key_key` UNIQUE (`order_id`, `idempotency_key`),
  PRIMARY KEY (`id`),
  CONSTRAINT `payments_refund_within_amount` CHECK ((`refunded_amount` <= `amount`)),
  CONSTRAINT `payments_refunded_amount_check` CHECK ((`refunded_amount` >= 0))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `product_images` (
  `id` BINARY(16) NOT NULL,
  `product_id` BINARY(16) NOT NULL,
  `url` VARCHAR(512) NOT NULL,
  `alt` VARCHAR(190) NOT NULL DEFAULT '',
  `width` INT NOT NULL,
  `height` INT NOT NULL,
  `role` VARCHAR(190) NOT NULL DEFAULT 'gallery',
  CONSTRAINT `product_images_role_enum` CHECK (`role` IN ('card', 'gallery')),
  `position` INT NOT NULL DEFAULT 0,
  CONSTRAINT `product_images_height_check` CHECK ((`height` > 0)),
  PRIMARY KEY (`id`),
  CONSTRAINT `product_images_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `product_images_width_check` CHECK ((`width` > 0)),
  INDEX `product_images_product` (`product_id`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `promotion_redemptions` (
  `id` BINARY(16) NOT NULL,
  `promotion_id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `customer_id` BINARY(16) NULL,
  `email` VARCHAR(254) NOT NULL,
  CONSTRAINT `promotion_redemptions_email_normalized` CHECK (BINARY `email` = BINARY LOWER(TRIM(`email`))),
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `promotion_redemptions_customer_id_fkey` FOREIGN KEY (`customer_id`) REFERENCES `customers`(`id`) ON DELETE SET NULL,
  CONSTRAINT `promotion_redemptions_email_check` CHECK ((`email` = lower(`email`))),
  CONSTRAINT `promotion_redemptions_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  CONSTRAINT `promotion_redemptions_promotion_id_fkey` FOREIGN KEY (`promotion_id`) REFERENCES `promotions`(`id`) ON DELETE CASCADE,
  CONSTRAINT `promotion_redemptions_promotion_id_order_id_key` UNIQUE (`promotion_id`, `order_id`),
  INDEX `promotion_redemptions_email` (`promotion_id`, `email`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `returns` (
  `id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `status` VARCHAR(190) NOT NULL DEFAULT 'requested',
  CONSTRAINT `returns_status_enum` CHECK (`status` IN ('requested', 'approved', 'received', 'rejected')),
  `lines` JSON NOT NULL,
  CONSTRAINT `returns_lines_json_valid` CHECK (JSON_VALID(`lines`)),
  `reason` TEXT NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `returns_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  PRIMARY KEY (`id`),
  `open_order` BINARY(16) GENERATED ALWAYS AS (CASE WHEN `status` <> 'rejected' THEN `order_id` ELSE NULL END) VIRTUAL,
  UNIQUE INDEX `returns_one_open` (`open_order`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `variants` (
  `id` BINARY(16) NOT NULL,
  `product_id` BINARY(16) NOT NULL,
  `sku` VARCHAR(190) NOT NULL,
  `size_eu` VARCHAR(190) NOT NULL,
  `size_uk` VARCHAR(190) NOT NULL,
  `size_us` VARCHAR(190) NOT NULL,
  `size_cm` VARCHAR(190) NOT NULL,
  `attributes` JSON NOT NULL DEFAULT ('{}'),
  CONSTRAINT `variants_attributes_json_valid` CHECK (JSON_VALID(`attributes`)),
  `weight_grams` INT NOT NULL DEFAULT 0,
  `position` INT NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  CONSTRAINT `variants_product_id_fkey` FOREIGN KEY (`product_id`) REFERENCES `products`(`id`) ON DELETE CASCADE,
  CONSTRAINT `variants_sku_key` UNIQUE (`sku`),
  CONSTRAINT `variants_weight_grams_check` CHECK ((`weight_grams` >= 0)),
  INDEX `variants_product` (`product_id`, `position`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `cart_lines` (
  `id` BINARY(16) NOT NULL,
  `cart_id` BINARY(16) NOT NULL,
  `variant_id` BINARY(16) NOT NULL,
  `quantity` INT NOT NULL,
  `added_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `cart_lines_cart_id_fkey` FOREIGN KEY (`cart_id`) REFERENCES `carts`(`id`) ON DELETE CASCADE,
  CONSTRAINT `cart_lines_cart_id_variant_id_key` UNIQUE (`cart_id`, `variant_id`),
  PRIMARY KEY (`id`),
  CONSTRAINT `cart_lines_quantity_check` CHECK (((`quantity` >= 1) AND (`quantity` <= 10))),
  CONSTRAINT `cart_lines_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_levels` (
  `variant_id` BINARY(16) NOT NULL,
  `on_hand` INT NOT NULL DEFAULT 0,
  `reserved` INT NOT NULL DEFAULT 0,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT `inventory_levels_on_hand_check` CHECK ((`on_hand` >= 0)),
  PRIMARY KEY (`variant_id`),
  CONSTRAINT `inventory_levels_reserved_check` CHECK ((`reserved` >= 0)),
  CONSTRAINT `inventory_levels_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE,
  CONSTRAINT `inventory_reserved_within_on_hand` CHECK ((`reserved` <= `on_hand`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_movements` (
  `id` BINARY(16) NOT NULL,
  `variant_id` BINARY(16) NOT NULL,
  `delta` INT NOT NULL,
  `reason` TEXT NOT NULL,
  `actor` VARCHAR(190) NOT NULL,
  `at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  CONSTRAINT `inventory_movements_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `inventory_reservations` (
  `id` BINARY(16) NOT NULL,
  `cart_id` BINARY(16) NOT NULL,
  `variant_id` BINARY(16) NOT NULL,
  `quantity` INT NOT NULL,
  `expires_at` DATETIME(3) NOT NULL,
  PRIMARY KEY (`id`),
  CONSTRAINT `inventory_reservations_quantity_check` CHECK ((`quantity` > 0)),
  CONSTRAINT `inventory_reservations_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE,
  INDEX `inventory_reservations_cart` (`cart_id`),
  INDEX `inventory_reservations_expiry` (`expires_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `prices` (
  `price_list_id` BINARY(16) NOT NULL,
  `variant_id` BINARY(16) NOT NULL,
  `amount` BIGINT NOT NULL,
  CONSTRAINT `prices_amount_safe` CHECK (`amount` BETWEEN -9007199254740991 AND 9007199254740991),
  `compare_at` BIGINT NULL,
  CONSTRAINT `prices_compare_at_safe` CHECK (`compare_at` BETWEEN -9007199254740991 AND 9007199254740991),
  CONSTRAINT `prices_amount_check` CHECK ((`amount` >= 0)),
  CONSTRAINT `prices_check` CHECK (((`compare_at` IS NULL) OR (`compare_at` > `amount`))),
  PRIMARY KEY (`price_list_id`, `variant_id`),
  CONSTRAINT `prices_price_list_id_fkey` FOREIGN KEY (`price_list_id`) REFERENCES `price_lists`(`id`) ON DELETE CASCADE,
  CONSTRAINT `prices_variant_id_fkey` FOREIGN KEY (`variant_id`) REFERENCES `variants`(`id`) ON DELETE CASCADE,
  INDEX `prices_variant` (`variant_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `refunds` (
  `id` BINARY(16) NOT NULL,
  `order_id` BINARY(16) NOT NULL,
  `payment_id` BINARY(16) NULL,
  `amount` BIGINT NOT NULL,
  CONSTRAINT `refunds_amount_safe` CHECK (`amount` BETWEEN -9007199254740991 AND 9007199254740991),
  `reason` TEXT NOT NULL,
  `lines` JSON NOT NULL DEFAULT ('[]'),
  CONSTRAINT `refunds_lines_json_valid` CHECK (JSON_VALID(`lines`)),
  `restock` TINYINT(1) NOT NULL DEFAULT 0,
  CONSTRAINT `refunds_restock_boolean` CHECK (`restock` IN (0, 1)),
  `idempotency_key` VARCHAR(190) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT `refunds_amount_check` CHECK ((`amount` > 0)),
  CONSTRAINT `refunds_order_id_fkey` FOREIGN KEY (`order_id`) REFERENCES `orders`(`id`) ON DELETE CASCADE,
  CONSTRAINT `refunds_order_id_idempotency_key_key` UNIQUE (`order_id`, `idempotency_key`),
  CONSTRAINT `refunds_payment_id_fkey` FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`),
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- carts.promotion_codes normalized child relation.
CREATE TABLE IF NOT EXISTS `cart_promotion_codes` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `cart_promotion_codes_value` (`value`, `id`),
  CONSTRAINT `cart_promotion_codes_parent_fk` FOREIGN KEY (`id`) REFERENCES `carts` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- orders.promotion_codes normalized child relation.
CREATE TABLE IF NOT EXISTS `order_promotion_codes` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `order_promotion_codes_value` (`value`, `id`),
  CONSTRAINT `order_promotion_codes_parent_fk` FOREIGN KEY (`id`) REFERENCES `orders` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- products.tags normalized child relation.
CREATE TABLE IF NOT EXISTS `product_tags` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `product_tags_value` (`value`, `id`),
  CONSTRAINT `product_tags_parent_fk` FOREIGN KEY (`id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- feature_flags.customer_groups normalized child relation.
CREATE TABLE IF NOT EXISTS `feature_flag_customer_groups` (
  `store_id` BINARY(16) NOT NULL,
  `key` VARCHAR(190) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`store_id`, `key`, `position`),
  INDEX `feature_flag_customer_groups_value` (`value`, `store_id`, `key`),
  CONSTRAINT `feature_flag_customer_groups_parent_fk` FOREIGN KEY (`store_id`, `key`) REFERENCES `feature_flags` (`store_id`, `key`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shipping_zones.countries normalized child relation.
CREATE TABLE IF NOT EXISTS `shipping_zone_countries` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `shipping_zone_countries_value` (`value`, `id`),
  CONSTRAINT `shipping_zone_countries_parent_fk` FOREIGN KEY (`id`) REFERENCES `shipping_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- shipping_zones.cities normalized child relation.
CREATE TABLE IF NOT EXISTS `shipping_zone_cities` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `shipping_zone_cities_value` (`value`, `id`),
  CONSTRAINT `shipping_zone_cities_parent_fk` FOREIGN KEY (`id`) REFERENCES `shipping_zones` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- staff_members.recovery_codes normalized child relation.
CREATE TABLE IF NOT EXISTS `staff_recovery_codes` (
  `user_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`user_id`, `store_id`, `position`),
  INDEX `staff_recovery_codes_value` (`value`, `user_id`, `store_id`),
  CONSTRAINT `staff_recovery_codes_parent_fk` FOREIGN KEY (`user_id`, `store_id`) REFERENCES `staff_members` (`user_id`, `store_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- search_synonyms.synonyms normalized child relation.
CREATE TABLE IF NOT EXISTS `search_synonym_values` (
  `id` BINARY(16) NOT NULL,
  `position` INT NOT NULL CHECK (`position` >= 0),
  `value` VARCHAR(190) NOT NULL,
  PRIMARY KEY (`id`, `position`),
  INDEX `search_synonym_values_value` (`value`, `id`),
  CONSTRAINT `search_synonym_values_parent_fk` FOREIGN KEY (`id`) REFERENCES `search_synonyms` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


INSERT INTO schema_migrations (name, checksum) VALUES ('0001_core.sql', '195be97fe8b91e7a53efa17262d130be593d8f6c5e9992a3685597eeb367180b') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0002_projections_and_auth.sql / SHA256 1bf6330396496cfa748cbdb8e4b8784999ec8c2f9619ad96c1e386c81d243eff
-- Normalized projections and durable infrastructure; no triggers or additional backend.
SET NAMES utf8mb4 COLLATE utf8mb4_unicode_ci;
SET time_zone = '+00:00';

CREATE TABLE IF NOT EXISTS `product_attribute_values` (
  `product_id` BINARY(16) NOT NULL,
  `attribute_key` VARCHAR(100) NOT NULL,
  `value_text` VARCHAR(190) NOT NULL,
  `value_num` DECIMAL(20,6) NULL,
  PRIMARY KEY (`product_id`, `attribute_key`, `value_text`),
  INDEX `attribute_facet_text` (`attribute_key`, `value_text`, `product_id`),
  INDEX `attribute_facet_number` (`attribute_key`, `value_num`, `product_id`),
  CONSTRAINT `attribute_values_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `variant_attribute_values` (
  `variant_id` BINARY(16) NOT NULL,
  `attribute_key` VARCHAR(100) NOT NULL,
  `value_text` VARCHAR(190) NOT NULL,
  `value_num` DECIMAL(20,6) NULL,
  PRIMARY KEY (`variant_id`, `attribute_key`, `value_text`),
  INDEX `variant_attribute_facet_text` (`attribute_key`, `value_text`, `variant_id`),
  INDEX `variant_attribute_facet_number` (`attribute_key`, `value_num`, `variant_id`),
  CONSTRAINT `variant_attribute_values_fk` FOREIGN KEY (`variant_id`) REFERENCES `variants` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `order_number_sequences` (
  `store_id` BINARY(16) NOT NULL,
  `prefix` VARCHAR(20) NOT NULL,
  `next_value` BIGINT NOT NULL CHECK (`next_value` BETWEEN 1 AND 9007199254740991),
  PRIMARY KEY (`store_id`),
  CONSTRAINT `order_number_sequences_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_documents` (
  `product_id` BINARY(16) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL,
  `title` TEXT NOT NULL,
  `body` TEXT NOT NULL,
  `prefix` VARCHAR(190) NOT NULL,
  `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`product_id`),
  INDEX `search_document_prefix` (`store_id`, `prefix`, `product_id`),
  INDEX `search_document_slug` (`store_id`, `slug`),
  FULLTEXT INDEX `search_document_fulltext` (`title`, `body`),
  CONSTRAINT `search_documents_product_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE,
  CONSTRAINT `search_documents_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_terms` (
  `store_id` BINARY(16) NOT NULL,
  `term` VARCHAR(100) NOT NULL,
  `document_frequency` INT NOT NULL CHECK (`document_frequency` >= 0),
  `length` INT NOT NULL CHECK (`length` BETWEEN 1 AND 100),
  PRIMARY KEY (`store_id`, `term`),
  INDEX `search_terms_candidates` (`store_id`, `length`, `term`),
  CONSTRAINT `search_terms_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `search_document_terms` (
  `product_id` BINARY(16) NOT NULL,
  `term` VARCHAR(100) NOT NULL,
  PRIMARY KEY (`product_id`, `term`),
  INDEX `document_terms_lookup` (`term`, `product_id`),
  CONSTRAINT `search_document_terms_fk` FOREIGN KEY (`product_id`) REFERENCES `products` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `auth_tokens` (
  `token_hash` CHAR(64) NOT NULL,
  `store_id` BINARY(16) NOT NULL,
  `kind` VARCHAR(30) NOT NULL CHECK (`kind` IN ('verify_email', 'magic_link', 'oauth_state', 'owner_bootstrap')),
  `identity_id` BINARY(16) NULL,
  `email` VARCHAR(254) NULL,
  `payload` JSON NULL CHECK (JSON_VALID(`payload`)),
  `expires_at` DATETIME(3) NOT NULL,
  `used_at` DATETIME(3) NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`token_hash`),
  INDEX `auth_tokens_expiry` (`expires_at`),
  INDEX `auth_tokens_identity` (`store_id`, `identity_id`, `kind`),
  CONSTRAINT `auth_tokens_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `oauth_accounts` (
  `id` BINARY(16) NOT NULL,
  `customer_id` BINARY(16) NOT NULL,
  `provider` VARCHAR(30) NOT NULL,
  `subject` VARCHAR(190) NOT NULL,
  `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE INDEX `oauth_provider_subject` (`provider`, `subject`),
  INDEX `oauth_customer` (`customer_id`),
  CONSTRAINT `oauth_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `media_variants` (
  `media_id` BINARY(16) NOT NULL,
  `width` INT NOT NULL CHECK (`width` > 0),
  `format` VARCHAR(10) NOT NULL CHECK (`format` IN ('webp', 'avif')),
  `path` VARCHAR(512) NOT NULL,
  `bytes` INT NOT NULL CHECK (`bytes` > 0),
  `etag` CHAR(64) NOT NULL,
  PRIMARY KEY (`media_id`, `width`, `format`),
  CONSTRAINT `media_variants_media_fk` FOREIGN KEY (`media_id`) REFERENCES `media` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `store_metadata` (
  `store_id` BINARY(16) NOT NULL,
  `slug` VARCHAR(190) NOT NULL CHECK (BINARY `slug` = BINARY LOWER(TRIM(`slug`))),
  `default_locale` VARCHAR(20) NOT NULL,
  PRIMARY KEY (`store_id`),
  UNIQUE INDEX `store_metadata_slug` (`slug`),
  CONSTRAINT `store_metadata_store_fk` FOREIGN KEY (`store_id`) REFERENCES `stores` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `customer_security` (
  `customer_id` BINARY(16) NOT NULL,
  `email_verified_at` DATETIME(3) NULL,
  `failed_logins` INT NOT NULL DEFAULT 0 CHECK (`failed_logins` >= 0),
  `locked_until` DATETIME(3) NULL,
  PRIMARY KEY (`customer_id`),
  CONSTRAINT `customer_security_customer_fk` FOREIGN KEY (`customer_id`) REFERENCES `customers` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0002_projections_and_auth.sql', '1bf6330396496cfa748cbdb8e4b8784999ec8c2f9619ad96c1e386c81d243eff') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0003_integrity_and_listing_indexes.sql / SHA256 aedde1dbd096d86122e21c00b91a1821e60b4330658568629cf2d897eb9b5121
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

INSERT INTO schema_migrations (name, checksum) VALUES ('0003_integrity_and_listing_indexes.sql', 'aedde1dbd096d86122e21c00b91a1821e60b4330658568629cf2d897eb9b5121') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0004_order_ownership_projections.sql / SHA256 9bc10d2de8fe5af5aab72daa3818cd2b26debd8fb833dd8b0dcc57b7a7f73f2d
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

INSERT INTO schema_migrations (name, checksum) VALUES ('0004_order_ownership_projections.sql', '9bc10d2de8fe5af5aab72daa3818cd2b26debd8fb833dd8b0dcc57b7a7f73f2d') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0005_import_and_flag_targeting.sql / SHA256 5cb211017e1babf122a6d7306f9b2ff73ebaf110625174232ba46a927333014e
ALTER TABLE `feature_flags` ADD COLUMN `groups_restricted` TINYINT(1) NOT NULL DEFAULT 0 CHECK (`groups_restricted` IN (0, 1));
UPDATE `feature_flags` f SET groups_restricted = 1 WHERE EXISTS (
  SELECT 1 FROM `feature_flag_customer_groups` g WHERE g.store_id = f.store_id AND g.`key` = f.`key`
);

CREATE TABLE IF NOT EXISTS `data_imports` (
  `name` VARCHAR(190) NOT NULL,
  `digest` CHAR(64) NOT NULL,
  `counts` JSON NOT NULL CHECK (JSON_VALID(`counts`)),
  `applied_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0005_import_and_flag_targeting.sql', '5cb211017e1babf122a6d7306f9b2ff73ebaf110625174232ba46a927333014e') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0006_collection_order.sql / SHA256 437deb05625c878f8eff25a51d490c556ceaffec8d63bf778b0c80b7a0ceeeb5
-- Independent ordering within a collection and of memberships on a product.
ALTER TABLE `collection_products` ADD COLUMN `product_position` INT NOT NULL DEFAULT 0 CHECK (`product_position` >= 0);
CREATE INDEX `collection_products_membership_order` ON `collection_products` (`product_id`, `product_position`);

INSERT INTO schema_migrations (name, checksum) VALUES ('0006_collection_order.sql', '437deb05625c878f8eff25a51d490c556ceaffec8d63bf778b0c80b7a0ceeeb5') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0007_auth_assurance.sql / SHA256 decf62838faf9e83a0b4be257514a25282b59ba3f25dcacdd4e4511427c75c01
-- Privilege level and the second-factor proof must agree; no trigger dependency.
ALTER TABLE `staff_sessions`
  ADD CONSTRAINT `staff_session_assurance` CHECK (
    (`aal` = 1 AND `mfa_at` IS NULL) OR (`aal` = 2 AND `mfa_at` IS NOT NULL)
  );

CREATE INDEX `customer_sessions_owner_expiry` ON `sessions` (`customer_id`, `expires_at`, `created_at`);

INSERT INTO schema_migrations (name, checksum) VALUES ('0007_auth_assurance.sql', 'decf62838faf9e83a0b4be257514a25282b59ba3f25dcacdd4e4511427c75c01') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0008_delivery_channels.sql / SHA256 08ef05851212341cadfe0e8d4ef818b7f2683f620e366134a22a551c6c0cdea8
-- Independent channel receipts keep a webhook retry from sending an email again.
CREATE TABLE IF NOT EXISTS outbox_channels (
  event_id BINARY(16) NOT NULL,
  channel VARCHAR(190) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  lease_until DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  PRIMARY KEY (event_id, channel),
  CONSTRAINT outbox_channels_event_fk FOREIGN KEY (event_id) REFERENCES outbox_events(id) ON DELETE CASCADE,
  CONSTRAINT outbox_channels_status_ck CHECK (status IN ('pending', 'sending', 'delivered')),
  INDEX outbox_channels_lease_idx (status, lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0008_delivery_channels.sql', '08ef05851212341cadfe0e8d4ef818b7f2683f620e366134a22a551c6c0cdea8') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0009_delivery_fencing.sql / SHA256 d3251f742df7a944a79ba9f256f922e157e065124e79fe1f10427cd2452017d9
-- A paused worker cannot complete another worker's newer channel lease.
ALTER TABLE outbox_channels ADD COLUMN lease_token CHAR(36) NULL AFTER lease_until;

INSERT INTO schema_migrations (name, checksum) VALUES ('0009_delivery_fencing.sql', 'd3251f742df7a944a79ba9f256f922e157e065124e79fe1f10427cd2452017d9') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0010_search_field_indexes.sql / SHA256 a5b78595d55a3d427680a07b4ae1b2f2551c3010c163f47f50d0a62869a652ce
CREATE TABLE IF NOT EXISTS search_field_terms (
  product_id BINARY(16) NOT NULL,
  field VARCHAR(8) NOT NULL,
  term VARCHAR(100) NOT NULL,
  position INT NOT NULL,
  PRIMARY KEY (product_id, field, term),
  INDEX search_field_lookup (term, field, product_id),
  CONSTRAINT search_field_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT search_field_kind_ck CHECK (field IN ('title', 'body')),
  CONSTRAINT search_field_position_ck CHECK (position >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS search_skus (
  store_id BINARY(16) NOT NULL,
  compact VARCHAR(190) NOT NULL,
  product_id BINARY(16) NOT NULL,
  PRIMARY KEY (store_id, compact, product_id),
  CONSTRAINT search_sku_product_fk FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT search_sku_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0010_search_field_indexes.sql', 'a5b78595d55a3d427680a07b4ae1b2f2551c3010c163f47f50d0a62869a652ce') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0011_search_term_capacity.sql / SHA256 b10084c48017117b7da459ecb04a1dc78dd002c9d0a829510fc4fe738bef7625
-- Preserve every supported product-title word in the public vocabulary projection.
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) NOT NULL;

INSERT INTO schema_migrations (name, checksum) VALUES ('0011_search_term_capacity.sql', 'b10084c48017117b7da459ecb04a1dc78dd002c9d0a829510fc4fe738bef7625') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0012_search_binary_matching.sql / SHA256 d7911c3e1d2e6686433b35634601f00ca3712201d52f500ae1411133bd95d30a
-- Text is already folded with the shared Unicode normalizer. Binary comparisons preserve
-- JavaScript word semantics (for example, straße and strasse remain distinct).
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_document_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_terms MODIFY COLUMN term VARCHAR(100) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_skus MODIFY COLUMN compact VARCHAR(190) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
ALTER TABLE search_documents DROP INDEX search_document_fulltext;
ALTER TABLE search_documents MODIFY COLUMN title TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL, MODIFY COLUMN body TEXT CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL;
CREATE FULLTEXT INDEX search_document_fulltext ON search_documents (title, body);

INSERT INTO schema_migrations (name, checksum) VALUES ('0012_search_binary_matching.sql', 'd7911c3e1d2e6686433b35634601f00ca3712201d52f500ae1411133bd95d30a') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0013_refund_intents.sql / SHA256 5e573ea2e884d08a44ae29ce86976b199ae35395054bcd3b0aebb050f4c2da68
-- Reserve refundable money/units before an external provider call. Never expire an uncertain call.
CREATE TABLE IF NOT EXISTS refund_intents (
  id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  payment_id BINARY(16) NULL,
  idempotency_key VARCHAR(190) NOT NULL,
  provider_key CHAR(64) NOT NULL,
  provider VARCHAR(190) NULL,
  provider_ref VARCHAR(300) NULL,
  provider_refund_ref VARCHAR(300) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'prepared',
  request JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY refund_intents_order_key_uq (order_id, idempotency_key),
  UNIQUE KEY refund_intents_provider_key_uq (provider_key),
  INDEX refund_intents_pending_idx (store_id, order_id, status),
  CONSTRAINT refund_intents_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT refund_intents_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT refund_intents_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT refund_intents_status_ck CHECK (status IN ('prepared', 'provider_confirmed', 'completed')),
  CONSTRAINT refund_intents_request_ck CHECK (JSON_VALID(request))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0013_refund_intents.sql', '5e573ea2e884d08a44ae29ce86976b199ae35395054bcd3b0aebb050f4c2da68') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0014_listing_covering_indexes.sql / SHA256 19c3f448e2f1a76e4ee353d068cfb6a3c91aebddb25b5f7c3af57cbcfdaf5c3d
-- Existing CHECK enums already restrict these strings to short values. Smaller index keys
-- retain every valid value and permit covering facet indexes within both engines' key limits.
ALTER TABLE products MODIFY COLUMN status VARCHAR(16) NOT NULL DEFAULT 'draft',
  MODIFY COLUMN kind VARCHAR(16) NOT NULL,
  MODIFY COLUMN gender VARCHAR(16) NOT NULL,
  MODIFY COLUMN condition_grade VARCHAR(16) NULL;
CREATE INDEX products_store_status_facets ON products(store_id,status,gender,condition_grade,brand_id,position,id);
CREATE INDEX products_store_status_newest ON products(store_id,status,published_at DESC,position,id);
CREATE INDEX products_store_status_title ON products(store_id,status,title,position,id);
CREATE INDEX variants_product_size ON variants(product_id,size_eu);
CREATE INDEX variants_size_product ON variants(size_eu,product_id);
CREATE INDEX orders_store_total_desc ON orders(store_id,total DESC,placed_at DESC,id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0014_listing_covering_indexes.sql', '19c3f448e2f1a76e4ee353d068cfb6a3c91aebddb25b5f7c3af57cbcfdaf5c3d') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0015_listing_projections.sql / SHA256 de682e211be714ff6abfd52d75b285c3c1c53f41570d01a306fb71ff1c451df5
-- Compact, transactional projections avoid materializing wide variant/price tables on GET.
CREATE TABLE IF NOT EXISTS product_listing_sizes (
  product_id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  size_eu VARCHAR(190) NOT NULL,
  PRIMARY KEY(product_id,size_eu),
  INDEX listing_sizes_store_size(store_id,size_eu,product_id),
  CONSTRAINT listing_sizes_product_fk FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT listing_sizes_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS product_list_prices (
  product_id BINARY(16) NOT NULL,
  price_list_id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  amount BIGINT NOT NULL CHECK(amount BETWEEN 0 AND 9007199254740991),
  compare_at BIGINT NULL CHECK(compare_at BETWEEN -9007199254740991 AND 9007199254740991),
  PRIMARY KEY(product_id,price_list_id),
  INDEX listing_prices_list_amount(price_list_id,amount,product_id),
  CONSTRAINT listing_prices_product_fk FOREIGN KEY(product_id) REFERENCES products(id) ON DELETE CASCADE,
  CONSTRAINT listing_prices_list_fk FOREIGN KEY(price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE,
  CONSTRAINT listing_prices_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO product_listing_sizes(product_id,store_id,size_eu)
SELECT DISTINCT v.product_id,p.store_id,v.size_eu FROM variants v INNER JOIN products p ON p.id=v.product_id;

INSERT INTO product_list_prices(product_id,price_list_id,store_id,amount,compare_at)
SELECT product_id,price_list_id,store_id,amount,compare_at FROM (
  SELECT v.product_id,pr.price_list_id,p.store_id,pr.amount,pr.compare_at,
    ROW_NUMBER() OVER(PARTITION BY v.product_id,pr.price_list_id ORDER BY pr.amount,v.position,v.id) AS price_rank
  FROM prices pr INNER JOIN variants v ON v.id=pr.variant_id
    INNER JOIN products p ON p.id=v.product_id
    INNER JOIN price_lists pl ON pl.id=pr.price_list_id AND pl.store_id=p.store_id
) ranked_prices WHERE price_rank=1;

CREATE INDEX products_listing_by_id ON products(id,store_id,status,kind,gender,condition_grade,brand_id,published_at,position);

INSERT INTO schema_migrations (name, checksum) VALUES ('0015_listing_projections.sql', 'de682e211be714ff6abfd52d75b285c3c1c53f41570d01a306fb71ff1c451df5') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0016_order_search_indexes.sql / SHA256 16351560b695d24b7b5c0b6b33a300dd43366b33b82b04b3203bbb49c588e16e
-- Covering text-search branches read compact store ranges instead of wide order rows and
-- one correlated contact lookup per order. Keep each existing substring/collation rule.
CREATE INDEX orders_store_phone ON orders(store_id,phone,id);
CREATE INDEX orders_store_total_asc ON orders(store_id,total,placed_at DESC,id);
CREATE INDEX orders_store_placed_asc ON orders(store_id,placed_at,id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0016_order_search_indexes.sql', '16351560b695d24b7b5c0b6b33a300dd43366b33b82b04b3203bbb49c588e16e') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0017_order_search_projection.sql / SHA256 dc44db3e1bd54ea909ef668ca7f7f57cc7fe2a670bfc061dbe97faa3f29e4b24
-- Rebuild with scripts/reindex-orders.ts before starting this release on an
-- existing database. JavaScript lowercasing preserves the reference search
-- semantics, including Unicode mappings that differ from SQL LOWER().
CREATE TABLE IF NOT EXISTS order_search_documents (
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  search_text TEXT NOT NULL,
  number_bytes INT UNSIGNED NOT NULL,
  email_bytes INT UNSIGNED NOT NULL,
  phone_bytes INT UNSIGNED NOT NULL,
  phone_digits VARCHAR(190) NOT NULL,
  status VARCHAR(190) NOT NULL,
  payment_status VARCHAR(190) NOT NULL,
  payment_method VARCHAR(190) NOT NULL,
  placed_at DATETIME(3) NOT NULL,
  total BIGINT NOT NULL CHECK(total BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(store_id,order_id),
  UNIQUE INDEX order_search_order(order_id),
  CONSTRAINT order_search_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT order_search_order_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin;

INSERT INTO schema_migrations (name, checksum) VALUES ('0017_order_search_projection.sql', 'dc44db3e1bd54ea909ef668ca7f7f57cc7fe2a670bfc061dbe97faa3f29e4b24') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0018_order_search_table_defaults.sql / SHA256 9f4bf173926a476638e70c4256b37e58981226032fa0cc894744aad0debe00b6
-- Retain the shared table default; substring comparisons explicitly use binary
-- bytes and do not depend on the engine's accent/case collation rules.
ALTER TABLE order_search_documents DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0018_order_search_table_defaults.sql', '9f4bf173926a476638e70c4256b37e58981226032fa0cc894744aad0debe00b6') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0019_store_scoped_search_terms.sql / SHA256 9e920a54aec97662a4a34b6c2f241682aafbe50bd1e1e76ed4b97aa9302a19c2
-- Resolve matching terms without fetching the wide parent product on each hit.
ALTER TABLE search_field_terms ADD COLUMN store_id BINARY(16) NULL;
UPDATE search_field_terms t INNER JOIN products p ON p.id=t.product_id SET t.store_id=p.store_id;
ALTER TABLE search_field_terms MODIFY COLUMN store_id BINARY(16) NOT NULL,
  ADD INDEX search_field_store_lookup(store_id,term,field,product_id),
  ADD CONSTRAINT search_field_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE;

INSERT INTO schema_migrations (name, checksum) VALUES ('0019_store_scoped_search_terms.sql', '9e920a54aec97662a4a34b6c2f241682aafbe50bd1e1e76ed4b97aa9302a19c2') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0020_search_field_vocabulary.sql / SHA256 1e1a3a8ec5b28b0249f4ebddffe67cd58bed082bce0468d3335fa1dec630b165
-- Tiny field-aware vocabulary avoids scanning all postings to discover whether
-- a term's relevance is constant. UTF-16 lengths match the shared JS scorer.
CREATE TABLE IF NOT EXISTS search_field_vocabulary (
  store_id BINARY(16) NOT NULL,
  term VARCHAR(300) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin NOT NULL,
  field VARCHAR(8) NOT NULL CHECK(field IN ('title','body')),
  document_frequency INT NOT NULL CHECK(document_frequency>=0),
  length INT NOT NULL CHECK(length>=0),
  PRIMARY KEY(store_id,term,field),
  INDEX search_field_vocabulary_length(store_id,length,term,field),
  CONSTRAINT search_field_vocabulary_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO search_field_vocabulary(store_id,term,field,document_frequency,length)
SELECT store_id,term,field,COUNT(*),LENGTH(CONVERT(term USING utf16))/2
FROM search_field_terms GROUP BY store_id,term,field;

INSERT INTO schema_migrations (name, checksum) VALUES ('0020_search_field_vocabulary.sql', '1e1a3a8ec5b28b0249f4ebddffe67cd58bed082bce0468d3335fa1dec630b165') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0021_order_substring_lookup.sql / SHA256 ceb7cfcfe4af0aee141f37e7ad42c083eb4523f5ad8ad384669a92a20fa1d1fa
-- Re-run the bounded JS order reindex before startup after this upgrade.
CREATE TABLE IF NOT EXISTS order_search_values (
  store_id BINARY(16) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  kind TINYINT NOT NULL CHECK(kind IN (0,1)),
  normalized_text TEXT NOT NULL,
  PRIMARY KEY(store_id,value_hash),
  CONSTRAINT order_search_value_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_search_grams (
  store_id BINARY(16) NOT NULL,
  gram VARBINARY(12) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  PRIMARY KEY(store_id,gram,value_hash),
  INDEX order_search_gram_value(store_id,value_hash),
  CONSTRAINT order_search_gram_value_fk FOREIGN KEY(store_id,value_hash) REFERENCES order_search_values(store_id,value_hash) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
CREATE TABLE IF NOT EXISTS order_search_links (
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  value_hash BINARY(32) NOT NULL,
  PRIMARY KEY(store_id,value_hash,order_id),
  INDEX order_search_link_order(order_id),
  CONSTRAINT order_search_link_value_fk FOREIGN KEY(store_id,value_hash) REFERENCES order_search_values(store_id,value_hash) ON DELETE CASCADE,
  CONSTRAINT order_search_link_order_fk FOREIGN KEY(order_id) REFERENCES orders(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
ALTER TABLE order_search_documents ADD COLUMN search_version TINYINT NOT NULL DEFAULT 0;

INSERT INTO schema_migrations (name, checksum) VALUES ('0021_order_substring_lookup.sql', 'ceb7cfcfe4af0aee141f37e7ad42c083eb4523f5ad8ad384669a92a20fa1d1fa') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0022_price_head_scope.sql / SHA256 401e14ec8a467f9ac7a2ff11b6218d55a17079ed8048aadfd32bd57e378bbfdd
-- Count scoped coverage through a compact index, with tenant consistency enforced
-- by composite foreign keys rather than assumed from application writes.
CREATE UNIQUE INDEX products_id_store ON products(id,store_id);
CREATE UNIQUE INDEX price_lists_id_store ON price_lists(id,store_id);
ALTER TABLE product_list_prices ADD INDEX listing_prices_scope(store_id,price_list_id,product_id),
  ADD CONSTRAINT listing_prices_product_store_fk FOREIGN KEY(product_id,store_id) REFERENCES products(id,store_id) ON DELETE CASCADE,
  ADD CONSTRAINT listing_prices_list_store_fk FOREIGN KEY(price_list_id,store_id) REFERENCES price_lists(id,store_id) ON DELETE CASCADE;

INSERT INTO schema_migrations (name, checksum) VALUES ('0022_price_head_scope.sql', '401e14ec8a467f9ac7a2ff11b6218d55a17079ed8048aadfd32bd57e378bbfdd') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0023_product_brand_scope.sql / SHA256 fcd109be47f2d715b0a39386817ef1e1db803e2d7438b2c2b4ffab1b1bdb5082
-- Scoped ownership is structural, so non-brand facets can read the compact
-- product index without repeating the same brand lookup for every product.
CREATE UNIQUE INDEX brands_id_store ON brands(id,store_id);
ALTER TABLE products ADD CONSTRAINT products_brand_store_fk FOREIGN KEY(brand_id,store_id) REFERENCES brands(id,store_id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0023_product_brand_scope.sql', 'fcd109be47f2d715b0a39386817ef1e1db803e2d7438b2c2b4ffab1b1bdb5082') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0024_catalogue_read_revisions.sql / SHA256 fa551073977601098dd3dd46248f8429f0701598dc7cdcdcdfdb5b2b2059d731
-- Facet caches read this committed revision on every request. Relevant writes
-- advance it in their existing store-first transaction, including imports.
CREATE TABLE IF NOT EXISTS catalogue_read_revisions (
  store_id BINARY(16) NOT NULL,
  revision BIGINT NOT NULL DEFAULT 0 CHECK(revision BETWEEN 0 AND 9007199254740991),
  PRIMARY KEY(store_id),
  CONSTRAINT catalogue_read_revision_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
INSERT INTO catalogue_read_revisions(store_id,revision) SELECT id,0 FROM stores;

INSERT INTO schema_migrations (name, checksum) VALUES ('0024_catalogue_read_revisions.sql', 'fa551073977601098dd3dd46248f8429f0701598dc7cdcdcdfdb5b2b2059d731') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);


-- 0025_sitemap_indexes.sql / SHA256 e343aa4851224a123e5f670e34786eef7e150bedd1975df567f0ee9b2db082bb
-- Sitemap projections return bounded metadata, never hydrated product graphs.
CREATE INDEX products_sitemap ON products(store_id,status,id,slug,published_at);
CREATE INDEX product_images_sitemap ON product_images(product_id,position,id,url);
CREATE INDEX pages_sitemap ON pages(store_id,published,slug,updated_at);

INSERT INTO schema_migrations (name, checksum) VALUES ('0025_sitemap_indexes.sql', 'e343aa4851224a123e5f670e34786eef7e150bedd1975df567f0ee9b2db082bb') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
