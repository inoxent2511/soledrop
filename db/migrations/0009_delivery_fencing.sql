-- A paused worker cannot complete another worker's newer channel lease.
ALTER TABLE outbox_channels ADD COLUMN lease_token CHAR(36) NULL AFTER lease_until;
