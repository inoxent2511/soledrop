-- Preserve every supported product-title word in the public vocabulary projection.
ALTER TABLE search_field_terms MODIFY COLUMN term VARCHAR(300) NOT NULL;
