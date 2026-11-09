-- Resolve matching terms without fetching the wide parent product on each hit.
ALTER TABLE search_field_terms ADD COLUMN store_id BINARY(16) NULL;
UPDATE search_field_terms t INNER JOIN products p ON p.id=t.product_id SET t.store_id=p.store_id;
ALTER TABLE search_field_terms MODIFY COLUMN store_id BINARY(16) NOT NULL,
  ADD INDEX search_field_store_lookup(store_id,term,field,product_id),
  ADD CONSTRAINT search_field_store_fk FOREIGN KEY(store_id) REFERENCES stores(id) ON DELETE CASCADE;
