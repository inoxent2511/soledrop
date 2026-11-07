
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
