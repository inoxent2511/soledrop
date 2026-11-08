
-- 0011_search_term_capacity.sql / SHA256 b10084c48017117b7da459ecb04a1dc78dd002c9d0a829510fc4fe738bef7625
-- Preserve every supported product-title word in the public vocabulary projection.
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) NOT NULL;

INSERT INTO schema_migrations (name, checksum) VALUES ('0011_search_term_capacity.sql', 'b10084c48017117b7da459ecb04a1dc78dd002c9d0a829510fc4fe738bef7625') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
