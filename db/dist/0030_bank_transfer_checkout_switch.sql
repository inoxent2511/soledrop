
-- 0030_bank_transfer_checkout_switch.sql / SHA256 203c3d891bb80f90c55e15475c335618612eb8c70340030989494d1f6b4b58d0
-- Bank transfer stays off until bank details are configured and staff enable it.
INSERT IGNORE INTO feature_flags (store_id, `key`, description, enabled, groups_restricted)
VALUES (
  UNHEX('00000000000040008000000000000001'),
  'bank-transfer-payments',
  'Bank transfer at checkout after bank details are configured.',
  0,
  0
);

INSERT INTO schema_migrations (name, checksum) VALUES ('0030_bank_transfer_checkout_switch.sql', '203c3d891bb80f90c55e15475c335618612eb8c70340030989494d1f6b4b58d0') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
