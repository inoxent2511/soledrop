
-- 0019_store_scoped_search_terms.sql / SHA256 9e920a54aec97662a4a34b6c2f241682aafbe50bd1e1e76ed4b97aa9302a19c2
-- Resolve matching terms without fetching the wide parent product on each hit.
ALTER TABLE search_field_terms ADD COLUMN store_id BINARY(16) NULL;
UPDATE search_field_terms t INNER JOIN products p ON p.id=t.product_id SET t.store_id=p.store_id;
ALTER TABLE search_field_terms MODIFY COLUMN store_id BINARY(16) NOT NULL,
  ADD INDEX search_field_store_lookup(store_id,term,field,product_id),
  ADD CONSTRAINT search_field_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE;

INSERT INTO schema_migrations (name, checksum) VALUES ('0019_store_scoped_search_terms.sql', '9e920a54aec97662a4a34b6c2f241682aafbe50bd1e1e76ed4b97aa9302a19c2') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
