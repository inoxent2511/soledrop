-- Privilege level and the second-factor proof must agree; no trigger dependency.
ALTER TABLE `staff_sessions`
  ADD CONSTRAINT `staff_session_assurance` CHECK (
    (`aal` = 1 AND `mfa_at` IS NULL) OR (`aal` = 2 AND `mfa_at` IS NOT NULL)
  );

CREATE INDEX `customer_sessions_owner_expiry` ON `sessions` (`customer_id`, `expires_at`, `created_at`);
