-- Express delivery is no longer offered. Historical order shipping snapshots stay intact.
DELETE rate
FROM shipping_rates AS rate
JOIN shipping_zones AS zone ON zone.id = rate.zone_id
WHERE zone.store_id = UNHEX('00000000000040008000000000000001')
  AND rate.code = 'express';

DELETE FROM feature_flags
WHERE store_id = UNHEX('00000000000040008000000000000001')
  AND `key` = 'express-delivery';
