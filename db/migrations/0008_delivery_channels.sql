-- Independent channel receipts keep a webhook retry from sending an email again.
CREATE TABLE IF NOT EXISTS outbox_channels (
  event_id BINARY(16) NOT NULL,
  channel VARCHAR(190) NOT NULL,
  status VARCHAR(16) NOT NULL DEFAULT 'pending',
  lease_until DATETIME(3) NULL,
  delivered_at DATETIME(3) NULL,
  PRIMARY KEY (event_id, channel),
  CONSTRAINT outbox_channels_event_fk FOREIGN KEY (event_id) REFERENCES outbox_events(id) ON DELETE CASCADE,
  CONSTRAINT outbox_channels_status_ck CHECK (status IN ('pending', 'sending', 'delivered')),
  INDEX outbox_channels_lease_idx (status, lease_until)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
