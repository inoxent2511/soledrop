
-- 0026_inventory_available_index.sql / SHA256 52d7ccb1b77c6a7d21ee4201e2c767cad29e0bcf231d44741fd12b3cc9f1441b
-- Ordered, narrow stock reads avoid hydrating a capped product catalogue.
-- The stored value changes atomically with physical stock and reservations.
ALTER TABLE inventory_levels
  ADD COLUMN available INT GENERATED ALWAYS AS (on_hand - reserved) STORED,
  ADD INDEX inventory_available_lookup(available,variant_id);

INSERT INTO schema_migrations (name, checksum) VALUES ('0026_inventory_available_index.sql', '52d7ccb1b77c6a7d21ee4201e2c767cad29e0bcf231d44741fd12b3cc9f1441b') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
