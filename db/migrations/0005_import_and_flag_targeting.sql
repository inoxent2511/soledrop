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
