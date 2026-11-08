
-- 0009_delivery_fencing.sql / SHA256 d3251f742df7a944a79ba9f256f922e157e065124e79fe1f10427cd2452017d9
-- A paused worker cannot complete another worker's newer channel lease.
ALTER TABLE outbox_channels ADD COLUMN lease_token CHAR(36) NULL AFTER lease_until;

INSERT INTO schema_migrations (name, checksum) VALUES ('0009_delivery_fencing.sql', 'd3251f742df7a944a79ba9f256f922e157e065124e79fe1f10427cd2452017d9') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
