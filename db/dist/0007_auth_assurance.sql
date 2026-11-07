
-- 0007_auth_assurance.sql / SHA256 decf62838faf9e83a0b4be257514a25282b59ba3f25dcacdd4e4511427c75c01
-- Privilege level and the second-factor proof must agree; no trigger dependency.
ALTER TABLE `staff_sessions`
  ADD CONSTRAINT `staff_session_assurance` CHECK (
    (`aal` = 1 AND `mfa_at` IS NULL) OR (`aal` = 2 AND `mfa_at` IS NOT NULL)
  );

CREATE INDEX `customer_sessions_owner_expiry` ON `sessions` (`customer_id`, `expires_at`, `created_at`);

INSERT INTO schema_migrations (name, checksum) VALUES ('0007_auth_assurance.sql', 'decf62838faf9e83a0b4be257514a25282b59ba3f25dcacdd4e4511427c75c01') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
