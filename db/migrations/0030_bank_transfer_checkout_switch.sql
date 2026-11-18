-- Bank transfer stays off until bank details are configured and staff enable it.
INSERT IGNORE INTO feature_flags (store_id, `key`, description, enabled, groups_restricted)
VALUES (
  UNHEX('00000000000040008000000000000001'),
  'bank-transfer-payments',
  'Bank transfer at checkout after bank details are configured.',
  0,
  0
);
