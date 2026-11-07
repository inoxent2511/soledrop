# Local database tools

Committed forward-only SQL is authoritative. Engines: MySQL >=8.0.16 (8.0.15 ignores CHECK constraints) and MariaDB >=10.6, target 10.11. Tables use InnoDB, utf8mb4_unicode_ci, strict sessions, UTC and DATETIME(3). No trigger permission is required. New application keys use UUIDv7; imported UUIDv4 bytes remain unchanged. Money/counters reject unsafe JavaScript integers.

`pnpm db:up` starts both services in `compose.yml` after setting a private `LOCAL_DB_ROOT_PASSWORD`. Ports bind to loopback only: 3307 MySQL, 3308 MariaDB. `db:down` stops without deleting volumes.

If Docker is absent on Windows, use official portable ZIPs, initialize new data directories and configure ignored `.data/local-engines/instances.json`. Each entry contains `engine`, `host` (`127.0.0.1`), `port`, `binary`, `data`, `rootPassword`. Binary/data paths must be inside `.data/local-engines`. `db:up` then starts hidden portable processes; `db:down` issues authenticated SHUTDOWN. Never reuse another project's data directory. Initialization uses `mysqld --initialize-insecure` or `mariadb-install-db.exe`; immediately assign a random root password before use. Do not install a Windows service or expose a listening address other than loopback.

Current local acceptance versions: MySQL 8.0.46 and MariaDB 10.11.15. The official MySQL archive matched its published MD5 `003f527d5df61b663ff191038cd676bd`. A truncated MariaDB transfer was resumed to the advertised 93,255,302 bytes before extraction. Tooling, binaries, logs and credentials are ignored and excluded from deployment artifacts.

- `db:migrate`: DATABASE_URL uses a dedicated migrator. Checks the engine floor, takes a connection-owned advisory lock, verifies every applied checksum, and applies pending files. DDL auto-commits; failed files are not ledgered. Investigate a partial DDL failure before retrying. Never edit a committed migration; add the next numbered file.
- `db:lint`: validates portable schema declarations and ordered filenames.
- `db:bundle`: writes `dist/full-schema.sql` and per-file bundles with ledger checksums. Import into an empty selected database in phpMyAdmin. CREATE TABLE is guarded. Reapplying arbitrary future ALTER files requires the ledger-aware runner. Bundle checksum conflicts fail rather than rewriting history.
- `db:seed`: idempotent operating configuration equivalent to the existing minimal bootstrap. Does not seed or overwrite merchant products, staff, uploads or orders. Explicit demo/import tooling is separate.
- `db:reset` / `db:seed-reset`: destructive, **local test/QA databases only**. Requires a database named `soledrop_test` or `soledrop_qa` (optional suffix) and `DB_RESET_CONFIRM` equal to its name. Merchant databases and remote addresses are refused.
- `db:test`: real-engine tests. Reads ignored `.data/local-engines/test-connections.json` or private `DB_TEST_CONNECTIONS` JSON with `mysql` / `mariadb` entries, each containing `migratorUrl`, `appUrl`. Only loopback test/QA database names are accepted. Missing engines are not silently replaced with an emulator.

The app user has table-specific SELECT/INSERT/UPDATE/DELETE grants, except audit_log (SELECT/INSERT) and schema_migrations (SELECT). The migrator has schema DDL/DML rights only for its assigned database. Test probes prove audit UPDATE/DELETE and application CREATE TABLE are denied. Runtime connection/transaction infrastructure is a narrow raw-client exception; domain queries belong in repository files. Connection configuration, migrations, provisioning and test harnesses must never contain business rules.

Plain SQL and runtime column mappings intentionally separate schema authority from Drizzle declarations. PostgreSQL arrays are retained as child relations (ordered `position`, indexed `value`), not filterable JSON. Attribute and search projections are transactional write responsibilities. The two filtered unique guards use virtual generated columns, compatible with cascading foreign keys on both engines. Parent existence is enforced by foreign keys; child cardinality such as a nonempty synonym list is a repository transaction invariant.

No remote server or hosting account is contacted by the local tools. Account-specific setup and fallbacks are in [the Hostinger checklist](../docs/app/hostinger-checklist.md).
