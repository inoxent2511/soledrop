
-- 0029_retire_express_delivery.sql / SHA256 e39c02fd10050706a1026edff95c27bbb968cc078a2031f0abd05695933351d8
-- Express delivery is no longer offered. Historical order shipping snapshots stay intact.
DELETE rate
FROM shipping_rates AS rate
JOIN shipping_zones AS zone ON zone.id = rate.zone_id
WHERE zone.store_id = UNHEX('00000000000040008000000000000001')
  AND rate.code = 'express';

DELETE FROM feature_flags
WHERE store_id = UNHEX('00000000000040008000000000000001')
  AND `key` = 'express-delivery';

INSERT INTO schema_migrations (name, checksum) VALUES ('0029_retire_express_delivery.sql', 'e39c02fd10050706a1026edff95c27bbb968cc078a2031f0abd05695933351d8') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
