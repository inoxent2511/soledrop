
-- 0013_refund_intents.sql / SHA256 5e573ea2e884d08a44ae29ce86976b199ae35395054bcd3b0aebb050f4c2da68
-- Reserve refundable money/units before an external provider call. Never expire an uncertain call.
CREATE TABLE IF NOT EXISTS refund_intents (
  id BINARY(16) NOT NULL,
  store_id BINARY(16) NOT NULL,
  order_id BINARY(16) NOT NULL,
  payment_id BINARY(16) NULL,
  idempotency_key VARCHAR(190) NOT NULL,
  provider_key CHAR(64) NOT NULL,
  provider VARCHAR(190) NULL,
  provider_ref VARCHAR(300) NULL,
  provider_refund_ref VARCHAR(300) NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'prepared',
  request JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (id),
  UNIQUE KEY refund_intents_order_key_uq (order_id, idempotency_key),
  UNIQUE KEY refund_intents_provider_key_uq (provider_key),
  INDEX refund_intents_pending_idx (store_id, order_id, status),
  CONSTRAINT refund_intents_store_fk FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE,
  CONSTRAINT refund_intents_order_fk FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  CONSTRAINT refund_intents_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id) ON DELETE RESTRICT,
  CONSTRAINT refund_intents_status_ck CHECK (status IN ('prepared', 'provider_confirmed', 'completed')),
  CONSTRAINT refund_intents_request_ck CHECK (JSON_VALID(request))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

INSERT INTO schema_migrations (name, checksum) VALUES ('0013_refund_intents.sql', '5e573ea2e884d08a44ae29ce86976b199ae35395054bcd3b0aebb050f4c2da68') ON DUPLICATE KEY UPDATE checksum = IF(checksum = VALUES(checksum), checksum, NULL);
