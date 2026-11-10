-- Ordered, narrow stock reads avoid hydrating a capped product catalogue.
-- The stored value changes atomically with physical stock and reservations.
ALTER TABLE inventory_levels
  ADD COLUMN available INT GENERATED ALWAYS AS (on_hand - reserved) STORED,
  ADD INDEX inventory_available_lookup(available,variant_id);
