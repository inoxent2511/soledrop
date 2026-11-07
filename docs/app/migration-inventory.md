# Migration inventory ? PostgreSQL/Supabase to MySQL/MariaDB

Baseline: local commit 8bdc580 (A14). This is a plumbing migration. Existing components, routes, tokens, copy and UI journeys stay frozen. No remote account, database, payment or email is used.

## Stage ownership

M0 inventory/baseline; M1 SQL schema/pool/UUID/migrator; M2 repositories/contracts/data import; M3 transactional operations/concurrency; M4 auth; M5 actor authorization/grants; M6 storage/email/search/jobs; M7 dependent admin capabilities; M8 removal/env/readiness; M9 packaging/runbook; M10 QA.

## Observed starting state

The legacy SQL implementation uses Supabase, but the live local preview uses a saved file driver. Customer/staff auth already uses in-app scrypt, hashed opaque sessions, separate cookies and staff TOTP; no Supabase Auth SDK methods implement those journeys. No existing magic-link/OAuth/email-verification, reviews, wishlist, saved-view or version-history screens/tables were found. Product/page drafts and optimistic updatedAt guards do exist and stay. Optional new auth capabilities must preserve default screens and not require unavailable providers.

The private saved catalogue and uploads must be imported without changing IDs, prices, stock, order history or MFA setup. Existing UUIDv4 IDs are retained in BINARY(16); new IDs use UUIDv7. Natural business keys remain natural keys.

## Final legacy tables and columns

Introspected after every committed legacy migration in ephemeral legacy PGlite, solely to inventory the old model; this is not MySQL/MariaDB acceptance evidence. 53 tables; 423 columns; 563 constraints; 105 indexes; 77 policies.

### addresses ? db schema / server/customers/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| customer_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| full_name | text; required; no default | text |
| phone | text; required; no default | text |
| line1 | text; required; no default | text |
| line2 | text; nullable; no default | text |
| city | text; required; no default | text |
| province | text; required; no default | text |
| postal_code | text; nullable; no default | text |
| country | text; required; 'PK'::text | text |
| is_default | bool; required; false | TINYINT(1) + boolean CHECK |

### attribute_definitions ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| code | text; required; no default | text |
| label | text; required; no default | text |
| type | text; required; no default | text |
| scope | text; required; no default | text |
| options | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| filterable | bool; required; false | TINYINT(1) + boolean CHECK |
| position | int4; required; 0 | integer |

### audit_log ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| actor | text; required; no default | text |
| action | text; required; no default | text |
| entity | text; required; no default | text |
| entity_id | text; required; no default | text |
| before | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| after | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| at | timestamptz; required; now() | UTC DATETIME(3) |
| store_id | text; nullable; no default | BINARY(16), canonical UUID mapping |
| actor_role | text; nullable; no default | text |
| ip | text; nullable; no default | text |
| user_agent | text; nullable; no default | text |
| request_id | text; nullable; no default | text |
| reason | text; nullable; no default | text |

### brands ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| slug | text; required; no default | text |
| name | text; required; no default | text |
| position | int4; required; 0 | integer |

### cart_lines ? db schema / server/cart/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| cart_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| quantity | int4; required; no default | integer |
| added_at | timestamptz; required; now() | UTC DATETIME(3) |

### carts ? db schema / server/cart/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| token_hash | text; required; no default | text |
| customer_id | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| currency | currency_code; required; 'PKR'::currency_code | VARCHAR + same CHECK (currency CHAR(3)) |
| promotion_codes | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| status | cart_status; required; 'active'::cart_status | VARCHAR + same CHECK (currency CHAR(3)) |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### collection_products ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| collection_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| product_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| position | int4; required; 0 | integer |

### collections ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| slug | text; required; no default | text |
| title | text; required; no default | text |
| headline | jsonb; required; '["", ""]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| description | text; required; ''::text | text |
| kind | text; required; no default | text |
| rules | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| image | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| position | int4; required; 0 | integer |
| seo | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |

### contact_messages ? db schema / server/content/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| name | text; required; no default | text |
| email | text; required; no default | text |
| order_number | text; nullable; no default | text |
| message | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### custom_field_definitions ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| entity | text; required; no default | text |
| code | text; required; no default | text |
| label | text; required; no default | text |
| type | text; required; no default | text |
| required | bool; required; false | TINYINT(1) + boolean CHECK |
| visible_on_storefront | bool; required; false | TINYINT(1) + boolean CHECK |

### customers ? db schema / server/customers/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| email | text; required; no default | text |
| password_hash | text; required; no default | text |
| full_name | text; required; no default | text |
| phone | text; nullable; no default | text |
| customer_group | customer_group; required; 'retail'::customer_group | VARCHAR + same CHECK (currency CHAR(3)) |
| marketing_opt_in | bool; required; false | TINYINT(1) + boolean CHECK |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| deletion_requested_at | timestamptz; nullable; no default | UTC DATETIME(3) |

### exchange_rates ? db schema / server/pricing/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| base | currency_code; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| rates | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### faqs ? db schema / server/content/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| category | text; required; no default | text |
| question | text; required; no default | text |
| answer | text; required; no default | text |
| position | int4; required; 0 | integer |

### feature_flags ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| key | text; required; no default | text |
| description | text; required; ''::text | text |
| enabled | bool; required; false | TINYINT(1) + boolean CHECK |
| customer_groups | _text; nullable; no default | Indexed child relation preserving all values/order |

### idempotency_keys ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| key | text; required; no default | text |
| status | int4; required; no default | integer |
| body | jsonb; nullable; no default | JSON + JSON_VALID; indexed projection for filterable values |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| expires_at | timestamptz; required; (now() + '24:00:00'::interval) | UTC DATETIME(3) |

### inventory_levels ? db schema / server/inventory/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| on_hand | int4; required; 0 | integer |
| reserved | int4; required; 0 | integer |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### inventory_movements ? db schema / server/inventory/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| delta | int4; required; no default | integer |
| reason | text; required; no default | text |
| actor | text; required; no default | text |
| at | timestamptz; required; now() | UTC DATETIME(3) |

### inventory_reservations ? db schema / server/inventory/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| cart_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| quantity | int4; required; no default | integer |
| expires_at | timestamptz; required; no default | UTC DATETIME(3) |

### media ? db schema / server/media/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| path | text; required; no default | text |
| filename | text; required; no default | text |
| mime | text; required; no default | text |
| bytes | int4; required; no default | integer |
| width | int4; required; no default | integer |
| height | int4; required; no default | integer |
| alt | text; required; ''::text | text |
| created_by | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### newsletter_subscribers ? db schema / server/content/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| email | text; required; no default | text |
| source | text; required; no default | text |
| status | text; required; 'subscribed'::text | text |
| consent_at | timestamptz; required; now() | UTC DATETIME(3) |

### order_lines ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| product_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| slug | text; required; no default | text |
| title | text; required; no default | text |
| brand | text; required; no default | text |
| kind | product_kind; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| condition | condition_grade; nullable; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| size | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| image_url | text; required; no default | text |
| sku | text; required; no default | text |
| quantity | int4; required; no default | integer |
| unit_price | int8; required; no default | BIGINT minor units, safe integer conversion |
| compare_at | int8; nullable; no default | BIGINT minor units, safe integer conversion |
| discount | int8; required; 0 | BIGINT minor units, safe integer conversion |
| tax | int8; required; 0 | BIGINT minor units, safe integer conversion |
| total | int8; required; no default | BIGINT minor units, safe integer conversion |
| refunded_quantity | int4; required; 0 | integer |
| position | int4; required; 0 | integer |

### order_notes ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| author | uuid; required; no default | BINARY(16), canonical UUID mapping |
| author_name | text; required; no default | text |
| body | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### orders ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| number | text; required; no default | text |
| customer_id | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| email | text; required; no default | text |
| phone | text; required; no default | text |
| status | order_status; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| payment_status | payment_status; required; 'unpaid'::payment_status | VARCHAR + same CHECK (currency CHAR(3)) |
| fulfillment_status | fulfillment_status; required; 'unfulfilled'::fulfillment_status | VARCHAR + same CHECK (currency CHAR(3)) |
| currency | currency_code; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| subtotal | int8; required; no default | BIGINT minor units, safe integer conversion |
| discount_total | int8; required; 0 | BIGINT minor units, safe integer conversion |
| shipping_total | int8; required; 0 | BIGINT minor units, safe integer conversion |
| tax_total | int8; required; 0 | BIGINT minor units, safe integer conversion |
| tax_included | bool; required; no default | TINYINT(1) + boolean CHECK |
| total | int8; required; no default | BIGINT minor units, safe integer conversion |
| refunded_total | int8; required; 0 | BIGINT minor units, safe integer conversion |
| promotion_codes | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| shipping_address | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| shipping_method | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| payment_method | text; required; no default | text |
| idempotency_key | text; required; no default | text |
| access_token_hash | text; required; no default | text |
| custom_fields | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| note | text; nullable; no default | text |
| tracking_number | text; nullable; no default | text |
| history | jsonb; required; '[]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| placed_at | timestamptz; required; now() | UTC DATETIME(3) |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### outbox_events ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| topic | text; required; no default | text |
| payload | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| status | outbox_status; required; 'pending'::outbox_status | VARCHAR + same CHECK (currency CHAR(3)) |
| attempts | int4; required; 0 | integer |
| available_at | timestamptz; required; now() | UTC DATETIME(3) |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| delivered_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| last_error | text; nullable; no default | text |

### pages ? db schema / server/content/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| slug | text; required; no default | text |
| title | text; required; no default | text |
| description | text; required; ''::text | text |
| blocks | jsonb; required; '[]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| seo | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| published | bool; required; false | TINYINT(1) + boolean CHECK |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### password_resets ? db schema / server/customers/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| token_hash | text; required; no default | text |
| customer_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| expires_at | timestamptz; required; no default | UTC DATETIME(3) |
| used_at | timestamptz; nullable; no default | UTC DATETIME(3) |

### payments ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| provider | text; required; no default | text |
| status | payment_record_status; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| amount | int8; required; no default | BIGINT minor units, safe integer conversion |
| refunded_amount | int8; required; 0 | BIGINT minor units, safe integer conversion |
| currency | currency_code; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| provider_ref | text; nullable; no default | text |
| idempotency_key | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### permissions ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| key | text; required; no default | text |
| label | text; required; no default | text |
| group | text; required; no default | text |
| sensitive | bool; required; false | TINYINT(1) + boolean CHECK |

### price_lists ? db schema / server/pricing/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| code | text; required; no default | text |
| currency | currency_code; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| customer_group | customer_group; nullable; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| priority | int4; required; 0 | integer |
| starts_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| ends_at | timestamptz; nullable; no default | UTC DATETIME(3) |

### prices ? db schema / server/pricing/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| price_list_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| variant_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| amount | int8; required; no default | BIGINT minor units, safe integer conversion |
| compare_at | int8; nullable; no default | BIGINT minor units, safe integer conversion |

### product_images ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| product_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| url | text; required; no default | text |
| alt | text; required; ''::text | text |
| width | int4; required; no default | integer |
| height | int4; required; no default | integer |
| role | image_role; required; 'gallery'::image_role | VARCHAR + same CHECK (currency CHAR(3)) |
| position | int4; required; 0 | integer |

### products ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| slug | text; required; no default | text |
| title | text; required; no default | text |
| brand_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| kind | product_kind; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| gender | product_gender; required; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| status | product_status; required; 'draft'::product_status | VARCHAR + same CHECK (currency CHAR(3)) |
| description | text; required; ''::text | text |
| condition_grade | condition_grade; nullable; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| condition_notes | text; nullable; no default | text |
| attributes | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| custom_fields | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| tags | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| position | int4; required; 0 | integer |
| published_at | timestamptz; required; now() | UTC DATETIME(3) |
| seo | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### promotion_redemptions ? db schema / server/promotions/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| promotion_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| customer_id | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| email | text; required; no default | text |
| at | timestamptz; required; now() | UTC DATETIME(3) |

### promotions ? db schema / server/promotions/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| code | text; nullable; no default | text |
| title | text; required; no default | text |
| conditions | jsonb; required; '[]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| actions | jsonb; required; '[]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| starts_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| ends_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| usage_limit | int4; nullable; no default | integer |
| per_customer_limit | int4; nullable; no default | integer |
| times_used | int4; required; 0 | integer |
| active | bool; required; true | TINYINT(1) + boolean CHECK |
| combinable | bool; required; false | TINYINT(1) + boolean CHECK |

### rate_limits ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| key | text; required; no default | text |
| window_start | timestamptz; required; no default | UTC DATETIME(3) |
| count | int4; required; no default | integer |

### refunds ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| payment_id | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| amount | int8; required; no default | BIGINT minor units, safe integer conversion |
| reason | text; required; no default | text |
| lines | jsonb; required; '[]'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| restock | bool; required; false | TINYINT(1) + boolean CHECK |
| idempotency_key | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### returns ? db schema / server/orders/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| order_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| status | return_status; required; 'requested'::return_status | VARCHAR + same CHECK (currency CHAR(3)) |
| lines | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| reason | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### role_permissions ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| role_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| permission | text; required; no default | text |

### roles ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| key | text; required; no default | text |
| name | text; required; no default | text |
| description | text; required; ''::text | text |
| is_system | bool; required; false | TINYINT(1) + boolean CHECK |
| refund_limit | int8; nullable; no default | BIGINT minor units, safe integer conversion |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### search_queries ? db schema / server/search/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| query | text; required; no default | text |
| normalized | text; required; no default | text |
| result_count | int4; nullable; no default | integer |
| clicked_slug | text; nullable; no default | text |
| source | text; required; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### search_synonyms ? db schema / server/search/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| term | text; required; no default | text |
| synonyms | _text; required; no default | Indexed child relation preserving all values/order |

### sessions ? db schema / server/customers/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| token_hash | text; required; no default | text |
| customer_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| expires_at | timestamptz; required; no default | UTC DATETIME(3) |

### shipping_rates ? db schema / server/shipping/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| zone_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| code | text; required; no default | text |
| label | text; required; no default | text |
| amount | int8; required; no default | BIGINT minor units, safe integer conversion |
| free_over | int8; nullable; no default | BIGINT minor units, safe integer conversion |
| min_days | int4; required; no default | integer |
| max_days | int4; required; no default | integer |
| cash_on_delivery | bool; required; false | TINYINT(1) + boolean CHECK |

### shipping_zones ? db schema / server/shipping/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| name | text; required; no default | text |
| countries | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| cities | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| position | int4; required; 0 | integer |

### staff_invites ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| email | text; required; no default | text |
| role_key | text; required; no default | text |
| token_hash | text; required; no default | text |
| invited_by | uuid; nullable; no default | BINARY(16), canonical UUID mapping |
| expires_at | timestamptz; required; no default | UTC DATETIME(3) |
| accepted_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| revoked_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### staff_members ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| user_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| role | staff_role; nullable; no default | VARCHAR + same CHECK (currency CHAR(3)) |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| email | text; nullable; no default | text |
| display_name | text; required; ''::text | text |
| status | text; required; 'active'::text | text |
| password_hash | text; nullable; no default | text |
| totp_secret | text; nullable; no default | text |
| totp_enabled_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| totp_last_step | int8; nullable; no default | BIGINT minor units, safe integer conversion |
| recovery_codes | _text; required; '{}'::text[] | Indexed child relation preserving all values/order |
| failed_logins | int4; required; 0 | integer |
| locked_until | timestamptz; nullable; no default | UTC DATETIME(3) |
| last_seen_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| updated_at | timestamptz; required; now() | UTC DATETIME(3) |

### staff_roles ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| user_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| role_id | uuid; required; no default | BINARY(16), canonical UUID mapping |

### staff_sessions ? db schema / server/admin/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| user_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| token_hash | text; required; no default | text |
| aal | int2; required; no default | smallint |
| mfa_at | timestamptz; nullable; no default | UTC DATETIME(3) |
| ip | text; nullable; no default | text |
| user_agent | text; nullable; no default | text |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |
| last_seen_at | timestamptz; required; now() | UTC DATETIME(3) |
| expires_at | timestamptz; required; no default | UTC DATETIME(3) |
| revoked_at | timestamptz; nullable; no default | UTC DATETIME(3) |

### storefront_content ? db schema / server/content/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| content | jsonb; required; no default | JSON + JSON_VALID; indexed projection for filterable values |
| updated_at | timestamptz; required; clock_timestamp() | UTC DATETIME(3) |

### stores ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | text; required; no default | BINARY(16), canonical UUID mapping |
| name | text; required; no default | text |
| default_currency | currency_code; required; 'PKR'::currency_code | VARCHAR + same CHECK (currency CHAR(3)) |
| order_prefix | text; required; 'SD'::text | text |
| next_order_number | int8; required; 10001 | BIGINT minor units, safe integer conversion |
| created_at | timestamptz; required; now() | UTC DATETIME(3) |

### tax_rates ? db schema / server/shipping/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| store_id | text; required; no default | BINARY(16), canonical UUID mapping |
| country | text; required; no default | text |
| province | text; nullable; no default | text |
| label | text; required; no default | text |
| basis_points | int4; required; no default | integer |
| inclusive | bool; required; true | TINYINT(1) + boolean CHECK |

### variants ? db schema / server/catalog/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| product_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| sku | text; required; no default | text |
| size_eu | text; required; no default | text |
| size_uk | text; required; no default | text |
| size_us | text; required; no default | text |
| size_cm | text; required; no default | text |
| attributes | jsonb; required; '{}'::jsonb | JSON + JSON_VALID; indexed projection for filterable values |
| weight_grams | int4; required; 0 | integer |
| position | int4; required; 0 | integer |

### webhook_deliveries ? db schema / server/platform/mysql.repository.ts (M1/M2)

| Column | Existing type/default/nullability | Replacement |
| --- | --- | --- |
| id | uuid; required; gen_random_uuid() | BINARY(16), canonical UUID mapping |
| event_id | uuid; required; no default | BINARY(16), canonical UUID mapping |
| endpoint | text; required; no default | text |
| status | text; required; no default | text |
| response_status | int4; nullable; no default | integer |
| at | timestamptz; required; now() | UTC DATETIME(3) |

## Every enum (M1)

| Enum | Values | Replacement |
| --- | --- | --- |
| cart_status | active, converted, merged | VARCHAR/CHECK; same domain union |
| condition_grade | like-new, premium, excellent, very-good, minor-issue | VARCHAR/CHECK; same domain union |
| currency_code | PKR, USD, AED, GBP | VARCHAR/CHECK; same domain union |
| customer_group | retail, wholesale | VARCHAR/CHECK; same domain union |
| fulfillment_status | unfulfilled, fulfilled, returned | VARCHAR/CHECK; same domain union |
| image_role | card, gallery | VARCHAR/CHECK; same domain union |
| order_status | pending_payment, confirmed, processing, shipped, delivered, cancelled, returned | VARCHAR/CHECK; same domain union |
| outbox_status | pending, delivered, failed | VARCHAR/CHECK; same domain union |
| payment_record_status | pending, authorized, captured, failed, refunded, partially_refunded | VARCHAR/CHECK; same domain union |
| payment_status | unpaid, authorized, paid, partially_refunded, refunded, failed | VARCHAR/CHECK; same domain union |
| product_gender | men, women, kids, unisex | VARCHAR/CHECK; same domain union |
| product_kind | new, preloved | VARCHAR/CHECK; same domain union |
| product_status | draft, active, archived | VARCHAR/CHECK; same domain union |
| return_status | requested, approved, received, rejected | VARCHAR/CHECK; same domain union |
| staff_role | owner, manager, fulfilment, support | VARCHAR/CHECK; same domain union |

## Every constraint (M1/M3/M5)

| Table/name | Definition | Replacement |
| --- | --- | --- |
| addresses.addresses_city_not_null | NOT NULL city | NOT NULL preserved |
| addresses.addresses_country_not_null | NOT NULL country | NOT NULL preserved |
| addresses.addresses_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| addresses.addresses_customer_id_not_null | NOT NULL customer_id | NOT NULL preserved |
| addresses.addresses_full_name_not_null | NOT NULL full_name | NOT NULL preserved |
| addresses.addresses_id_not_null | NOT NULL id | NOT NULL preserved |
| addresses.addresses_is_default_not_null | NOT NULL is_default | NOT NULL preserved |
| addresses.addresses_line1_not_null | NOT NULL line1 | NOT NULL preserved |
| addresses.addresses_phone_not_null | NOT NULL phone | NOT NULL preserved |
| addresses.addresses_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| addresses.addresses_province_not_null | NOT NULL province | NOT NULL preserved |
| attribute_definitions.attribute_definitions_code_not_null | NOT NULL code | NOT NULL preserved |
| attribute_definitions.attribute_definitions_filterable_not_null | NOT NULL filterable | NOT NULL preserved |
| attribute_definitions.attribute_definitions_label_not_null | NOT NULL label | NOT NULL preserved |
| attribute_definitions.attribute_definitions_pkey | PRIMARY KEY (store_id, code) | Same PK, UUID columns BINARY(16) |
| attribute_definitions.attribute_definitions_position_not_null | NOT NULL "position" | NOT NULL preserved |
| attribute_definitions.attribute_definitions_scope_check | CHECK ((scope = ANY (ARRAY['product'::text, 'variant'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| attribute_definitions.attribute_definitions_scope_not_null | NOT NULL scope | NOT NULL preserved |
| attribute_definitions.attribute_definitions_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| attribute_definitions.attribute_definitions_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| attribute_definitions.attribute_definitions_type_check | CHECK ((type = ANY (ARRAY['text'::text, 'number'::text, 'boolean'::text, 'enum'::text, 'multi_enum'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| attribute_definitions.attribute_definitions_type_not_null | NOT NULL type | NOT NULL preserved |
| audit_log.audit_log_action_not_null | NOT NULL action | NOT NULL preserved |
| audit_log.audit_log_actor_not_null | NOT NULL actor | NOT NULL preserved |
| audit_log.audit_log_at_not_null | NOT NULL at | NOT NULL preserved |
| audit_log.audit_log_entity_id_not_null | NOT NULL entity_id | NOT NULL preserved |
| audit_log.audit_log_entity_not_null | NOT NULL entity | NOT NULL preserved |
| audit_log.audit_log_id_not_null | NOT NULL id | NOT NULL preserved |
| audit_log.audit_log_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| brands.brands_id_not_null | NOT NULL id | NOT NULL preserved |
| brands.brands_name_not_null | NOT NULL name | NOT NULL preserved |
| brands.brands_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| brands.brands_position_not_null | NOT NULL "position" | NOT NULL preserved |
| brands.brands_slug_not_null | NOT NULL slug | NOT NULL preserved |
| brands.brands_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| brands.brands_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| brands.brands_store_id_slug_key | UNIQUE (store_id, slug) | Normalized unique key; generated discriminator for partial uniqueness |
| cart_lines.cart_lines_added_at_not_null | NOT NULL added_at | NOT NULL preserved |
| cart_lines.cart_lines_cart_id_fkey | FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| cart_lines.cart_lines_cart_id_not_null | NOT NULL cart_id | NOT NULL preserved |
| cart_lines.cart_lines_cart_id_variant_id_key | UNIQUE (cart_id, variant_id) | Normalized unique key; generated discriminator for partial uniqueness |
| cart_lines.cart_lines_id_not_null | NOT NULL id | NOT NULL preserved |
| cart_lines.cart_lines_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| cart_lines.cart_lines_quantity_check | CHECK (((quantity >= 1) AND (quantity <= 10))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| cart_lines.cart_lines_quantity_not_null | NOT NULL quantity | NOT NULL preserved |
| cart_lines.cart_lines_variant_id_fkey | FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| cart_lines.cart_lines_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| carts.carts_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| carts.carts_currency_not_null | NOT NULL currency | NOT NULL preserved |
| carts.carts_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL | Equivalent FK, explicit delete rule and supporting index |
| carts.carts_id_not_null | NOT NULL id | NOT NULL preserved |
| carts.carts_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| carts.carts_promotion_codes_not_null | NOT NULL promotion_codes | NOT NULL preserved |
| carts.carts_status_not_null | NOT NULL status | NOT NULL preserved |
| carts.carts_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| carts.carts_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| carts.carts_token_hash_not_null | NOT NULL token_hash | NOT NULL preserved |
| carts.carts_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| collection_products.collection_products_collection_id_fkey | FOREIGN KEY (collection_id) REFERENCES collections(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| collection_products.collection_products_collection_id_not_null | NOT NULL collection_id | NOT NULL preserved |
| collection_products.collection_products_pkey | PRIMARY KEY (collection_id, product_id) | Same PK, UUID columns BINARY(16) |
| collection_products.collection_products_position_not_null | NOT NULL "position" | NOT NULL preserved |
| collection_products.collection_products_product_id_fkey | FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| collection_products.collection_products_product_id_not_null | NOT NULL product_id | NOT NULL preserved |
| collections.collections_description_not_null | NOT NULL description | NOT NULL preserved |
| collections.collections_headline_check | CHECK ((jsonb_typeof(headline) = 'array'::text)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| collections.collections_headline_not_null | NOT NULL headline | NOT NULL preserved |
| collections.collections_id_not_null | NOT NULL id | NOT NULL preserved |
| collections.collections_kind_check | CHECK ((kind = ANY (ARRAY['manual'::text, 'rule'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| collections.collections_kind_not_null | NOT NULL kind | NOT NULL preserved |
| collections.collections_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| collections.collections_position_not_null | NOT NULL "position" | NOT NULL preserved |
| collections.collections_seo_not_null | NOT NULL seo | NOT NULL preserved |
| collections.collections_slug_not_null | NOT NULL slug | NOT NULL preserved |
| collections.collections_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| collections.collections_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| collections.collections_store_id_slug_key | UNIQUE (store_id, slug) | Normalized unique key; generated discriminator for partial uniqueness |
| collections.collections_title_not_null | NOT NULL title | NOT NULL preserved |
| contact_messages.contact_messages_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| contact_messages.contact_messages_email_not_null | NOT NULL email | NOT NULL preserved |
| contact_messages.contact_messages_id_not_null | NOT NULL id | NOT NULL preserved |
| contact_messages.contact_messages_message_not_null | NOT NULL message | NOT NULL preserved |
| contact_messages.contact_messages_name_not_null | NOT NULL name | NOT NULL preserved |
| contact_messages.contact_messages_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| contact_messages.contact_messages_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| contact_messages.contact_messages_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_code_not_null | NOT NULL code | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_entity_check | CHECK ((entity = ANY (ARRAY['product'::text, 'order'::text, 'customer'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| custom_field_definitions.custom_field_definitions_entity_not_null | NOT NULL entity | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_label_not_null | NOT NULL label | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_pkey | PRIMARY KEY (store_id, entity, code) | Same PK, UUID columns BINARY(16) |
| custom_field_definitions.custom_field_definitions_required_not_null | NOT NULL required | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| custom_field_definitions.custom_field_definitions_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_type_check | CHECK ((type = ANY (ARRAY['text'::text, 'number'::text, 'boolean'::text, 'date'::text, 'url'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| custom_field_definitions.custom_field_definitions_type_not_null | NOT NULL type | NOT NULL preserved |
| custom_field_definitions.custom_field_definitions_visible_on_storefront_not_null | NOT NULL visible_on_storefront | NOT NULL preserved |
| customers.customers_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| customers.customers_customer_group_not_null | NOT NULL customer_group | NOT NULL preserved |
| customers.customers_email_check | CHECK ((email = lower(email))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| customers.customers_email_not_null | NOT NULL email | NOT NULL preserved |
| customers.customers_full_name_not_null | NOT NULL full_name | NOT NULL preserved |
| customers.customers_id_not_null | NOT NULL id | NOT NULL preserved |
| customers.customers_marketing_opt_in_not_null | NOT NULL marketing_opt_in | NOT NULL preserved |
| customers.customers_password_hash_not_null | NOT NULL password_hash | NOT NULL preserved |
| customers.customers_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| customers.customers_store_id_email_key | UNIQUE (store_id, email) | Normalized unique key; generated discriminator for partial uniqueness |
| customers.customers_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| customers.customers_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| exchange_rates.exchange_rates_base_not_null | NOT NULL base | NOT NULL preserved |
| exchange_rates.exchange_rates_pkey | PRIMARY KEY (store_id) | Same PK, UUID columns BINARY(16) |
| exchange_rates.exchange_rates_rates_not_null | NOT NULL rates | NOT NULL preserved |
| exchange_rates.exchange_rates_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| exchange_rates.exchange_rates_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| exchange_rates.exchange_rates_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| faqs.faqs_answer_not_null | NOT NULL answer | NOT NULL preserved |
| faqs.faqs_category_not_null | NOT NULL category | NOT NULL preserved |
| faqs.faqs_id_not_null | NOT NULL id | NOT NULL preserved |
| faqs.faqs_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| faqs.faqs_position_not_null | NOT NULL "position" | NOT NULL preserved |
| faqs.faqs_question_not_null | NOT NULL question | NOT NULL preserved |
| faqs.faqs_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| faqs.faqs_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| feature_flags.feature_flags_description_not_null | NOT NULL description | NOT NULL preserved |
| feature_flags.feature_flags_enabled_not_null | NOT NULL enabled | NOT NULL preserved |
| feature_flags.feature_flags_key_not_null | NOT NULL key | NOT NULL preserved |
| feature_flags.feature_flags_pkey | PRIMARY KEY (store_id, key) | Same PK, UUID columns BINARY(16) |
| feature_flags.feature_flags_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| feature_flags.feature_flags_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| idempotency_keys.idempotency_keys_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| idempotency_keys.idempotency_keys_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| idempotency_keys.idempotency_keys_key_not_null | NOT NULL key | NOT NULL preserved |
| idempotency_keys.idempotency_keys_pkey | PRIMARY KEY (key) | Same PK, UUID columns BINARY(16) |
| idempotency_keys.idempotency_keys_status_not_null | NOT NULL status | NOT NULL preserved |
| inventory_levels.inventory_levels_on_hand_check | CHECK ((on_hand >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| inventory_levels.inventory_levels_on_hand_not_null | NOT NULL on_hand | NOT NULL preserved |
| inventory_levels.inventory_levels_pkey | PRIMARY KEY (variant_id) | Same PK, UUID columns BINARY(16) |
| inventory_levels.inventory_levels_reserved_check | CHECK ((reserved >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| inventory_levels.inventory_levels_reserved_not_null | NOT NULL reserved | NOT NULL preserved |
| inventory_levels.inventory_levels_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| inventory_levels.inventory_levels_variant_id_fkey | FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| inventory_levels.inventory_levels_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| inventory_levels.inventory_reserved_within_on_hand | CHECK ((reserved <= on_hand)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| inventory_movements.inventory_movements_actor_not_null | NOT NULL actor | NOT NULL preserved |
| inventory_movements.inventory_movements_at_not_null | NOT NULL at | NOT NULL preserved |
| inventory_movements.inventory_movements_delta_not_null | NOT NULL delta | NOT NULL preserved |
| inventory_movements.inventory_movements_id_not_null | NOT NULL id | NOT NULL preserved |
| inventory_movements.inventory_movements_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| inventory_movements.inventory_movements_reason_not_null | NOT NULL reason | NOT NULL preserved |
| inventory_movements.inventory_movements_variant_id_fkey | FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| inventory_movements.inventory_movements_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| inventory_reservations.inventory_reservations_cart_id_not_null | NOT NULL cart_id | NOT NULL preserved |
| inventory_reservations.inventory_reservations_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| inventory_reservations.inventory_reservations_id_not_null | NOT NULL id | NOT NULL preserved |
| inventory_reservations.inventory_reservations_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| inventory_reservations.inventory_reservations_quantity_check | CHECK ((quantity > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| inventory_reservations.inventory_reservations_quantity_not_null | NOT NULL quantity | NOT NULL preserved |
| inventory_reservations.inventory_reservations_variant_id_fkey | FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| inventory_reservations.inventory_reservations_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| media.media_alt_not_null | NOT NULL alt | NOT NULL preserved |
| media.media_bytes_check | CHECK (((bytes > 0) AND (bytes <= 10485760))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| media.media_bytes_not_null | NOT NULL bytes | NOT NULL preserved |
| media.media_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| media.media_filename_not_null | NOT NULL filename | NOT NULL preserved |
| media.media_height_check | CHECK ((height > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| media.media_height_not_null | NOT NULL height | NOT NULL preserved |
| media.media_id_not_null | NOT NULL id | NOT NULL preserved |
| media.media_mime_check | CHECK ((mime = ANY (ARRAY['image/webp'::text, 'image/png'::text, 'image/jpeg'::text, 'image/avif'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| media.media_mime_not_null | NOT NULL mime | NOT NULL preserved |
| media.media_path_key | UNIQUE (path) | Normalized unique key; generated discriminator for partial uniqueness |
| media.media_path_not_null | NOT NULL path | NOT NULL preserved |
| media.media_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| media.media_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| media.media_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| media.media_width_check | CHECK ((width > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| media.media_width_not_null | NOT NULL width | NOT NULL preserved |
| newsletter_subscribers.newsletter_subscribers_consent_at_not_null | NOT NULL consent_at | NOT NULL preserved |
| newsletter_subscribers.newsletter_subscribers_email_check | CHECK ((email = lower(email))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| newsletter_subscribers.newsletter_subscribers_email_not_null | NOT NULL email | NOT NULL preserved |
| newsletter_subscribers.newsletter_subscribers_pkey | PRIMARY KEY (store_id, email) | Same PK, UUID columns BINARY(16) |
| newsletter_subscribers.newsletter_subscribers_source_not_null | NOT NULL source | NOT NULL preserved |
| newsletter_subscribers.newsletter_subscribers_status_check | CHECK ((status = ANY (ARRAY['subscribed'::text, 'unsubscribed'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| newsletter_subscribers.newsletter_subscribers_status_not_null | NOT NULL status | NOT NULL preserved |
| newsletter_subscribers.newsletter_subscribers_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| newsletter_subscribers.newsletter_subscribers_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| order_lines.order_lines_brand_not_null | NOT NULL brand | NOT NULL preserved |
| order_lines.order_lines_discount_check | CHECK ((discount >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_discount_not_null | NOT NULL discount | NOT NULL preserved |
| order_lines.order_lines_id_not_null | NOT NULL id | NOT NULL preserved |
| order_lines.order_lines_image_url_not_null | NOT NULL image_url | NOT NULL preserved |
| order_lines.order_lines_kind_not_null | NOT NULL kind | NOT NULL preserved |
| order_lines.order_lines_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| order_lines.order_lines_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| order_lines.order_lines_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| order_lines.order_lines_position_not_null | NOT NULL "position" | NOT NULL preserved |
| order_lines.order_lines_product_id_not_null | NOT NULL product_id | NOT NULL preserved |
| order_lines.order_lines_quantity_check | CHECK ((quantity > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_quantity_not_null | NOT NULL quantity | NOT NULL preserved |
| order_lines.order_lines_refund_within_quantity | CHECK ((refunded_quantity <= quantity)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_refunded_quantity_check | CHECK ((refunded_quantity >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_refunded_quantity_not_null | NOT NULL refunded_quantity | NOT NULL preserved |
| order_lines.order_lines_size_not_null | NOT NULL size | NOT NULL preserved |
| order_lines.order_lines_sku_not_null | NOT NULL sku | NOT NULL preserved |
| order_lines.order_lines_slug_not_null | NOT NULL slug | NOT NULL preserved |
| order_lines.order_lines_tax_check | CHECK ((tax >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_tax_not_null | NOT NULL tax | NOT NULL preserved |
| order_lines.order_lines_title_not_null | NOT NULL title | NOT NULL preserved |
| order_lines.order_lines_total_check | CHECK ((total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_total_not_null | NOT NULL total | NOT NULL preserved |
| order_lines.order_lines_unit_price_check | CHECK ((unit_price >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_lines.order_lines_unit_price_not_null | NOT NULL unit_price | NOT NULL preserved |
| order_lines.order_lines_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| order_notes.order_notes_author_name_not_null | NOT NULL author_name | NOT NULL preserved |
| order_notes.order_notes_author_not_null | NOT NULL author | NOT NULL preserved |
| order_notes.order_notes_body_check | CHECK (((length(body) >= 1) AND (length(body) <= 2000))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| order_notes.order_notes_body_not_null | NOT NULL body | NOT NULL preserved |
| order_notes.order_notes_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| order_notes.order_notes_id_not_null | NOT NULL id | NOT NULL preserved |
| order_notes.order_notes_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| order_notes.order_notes_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| order_notes.order_notes_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| orders.orders_access_token_hash_not_null | NOT NULL access_token_hash | NOT NULL preserved |
| orders.orders_currency_not_null | NOT NULL currency | NOT NULL preserved |
| orders.orders_custom_fields_not_null | NOT NULL custom_fields | NOT NULL preserved |
| orders.orders_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL | Equivalent FK, explicit delete rule and supporting index |
| orders.orders_discount_total_check | CHECK ((discount_total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_discount_total_not_null | NOT NULL discount_total | NOT NULL preserved |
| orders.orders_email_not_null | NOT NULL email | NOT NULL preserved |
| orders.orders_fulfillment_status_not_null | NOT NULL fulfillment_status | NOT NULL preserved |
| orders.orders_history_not_null | NOT NULL history | NOT NULL preserved |
| orders.orders_id_not_null | NOT NULL id | NOT NULL preserved |
| orders.orders_idempotency_key_not_null | NOT NULL idempotency_key | NOT NULL preserved |
| orders.orders_number_not_null | NOT NULL number | NOT NULL preserved |
| orders.orders_payment_method_not_null | NOT NULL payment_method | NOT NULL preserved |
| orders.orders_payment_status_not_null | NOT NULL payment_status | NOT NULL preserved |
| orders.orders_phone_not_null | NOT NULL phone | NOT NULL preserved |
| orders.orders_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| orders.orders_placed_at_not_null | NOT NULL placed_at | NOT NULL preserved |
| orders.orders_promotion_codes_not_null | NOT NULL promotion_codes | NOT NULL preserved |
| orders.orders_refund_within_total | CHECK ((refunded_total <= total)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_refunded_total_check | CHECK ((refunded_total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_refunded_total_not_null | NOT NULL refunded_total | NOT NULL preserved |
| orders.orders_shipping_address_not_null | NOT NULL shipping_address | NOT NULL preserved |
| orders.orders_shipping_method_not_null | NOT NULL shipping_method | NOT NULL preserved |
| orders.orders_shipping_total_check | CHECK ((shipping_total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_shipping_total_not_null | NOT NULL shipping_total | NOT NULL preserved |
| orders.orders_status_not_null | NOT NULL status | NOT NULL preserved |
| orders.orders_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) | Equivalent FK, explicit delete rule and supporting index |
| orders.orders_store_id_idempotency_key_key | UNIQUE (store_id, idempotency_key) | Normalized unique key; generated discriminator for partial uniqueness |
| orders.orders_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| orders.orders_store_id_number_key | UNIQUE (store_id, number) | Normalized unique key; generated discriminator for partial uniqueness |
| orders.orders_subtotal_check | CHECK ((subtotal >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_subtotal_not_null | NOT NULL subtotal | NOT NULL preserved |
| orders.orders_tax_included_not_null | NOT NULL tax_included | NOT NULL preserved |
| orders.orders_tax_total_check | CHECK ((tax_total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_tax_total_not_null | NOT NULL tax_total | NOT NULL preserved |
| orders.orders_total_check | CHECK ((total >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| orders.orders_total_not_null | NOT NULL total | NOT NULL preserved |
| orders.orders_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| outbox_events.outbox_events_attempts_not_null | NOT NULL attempts | NOT NULL preserved |
| outbox_events.outbox_events_available_at_not_null | NOT NULL available_at | NOT NULL preserved |
| outbox_events.outbox_events_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| outbox_events.outbox_events_id_not_null | NOT NULL id | NOT NULL preserved |
| outbox_events.outbox_events_payload_not_null | NOT NULL payload | NOT NULL preserved |
| outbox_events.outbox_events_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| outbox_events.outbox_events_status_not_null | NOT NULL status | NOT NULL preserved |
| outbox_events.outbox_events_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| outbox_events.outbox_events_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| outbox_events.outbox_events_topic_not_null | NOT NULL topic | NOT NULL preserved |
| pages.pages_blocks_not_null | NOT NULL blocks | NOT NULL preserved |
| pages.pages_description_not_null | NOT NULL description | NOT NULL preserved |
| pages.pages_pkey | PRIMARY KEY (store_id, slug) | Same PK, UUID columns BINARY(16) |
| pages.pages_published_not_null | NOT NULL published | NOT NULL preserved |
| pages.pages_seo_not_null | NOT NULL seo | NOT NULL preserved |
| pages.pages_slug_not_null | NOT NULL slug | NOT NULL preserved |
| pages.pages_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| pages.pages_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| pages.pages_title_not_null | NOT NULL title | NOT NULL preserved |
| pages.pages_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| password_resets.password_resets_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| password_resets.password_resets_customer_id_not_null | NOT NULL customer_id | NOT NULL preserved |
| password_resets.password_resets_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| password_resets.password_resets_pkey | PRIMARY KEY (token_hash) | Same PK, UUID columns BINARY(16) |
| password_resets.password_resets_token_hash_not_null | NOT NULL token_hash | NOT NULL preserved |
| payments.payments_amount_check | CHECK ((amount >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| payments.payments_amount_not_null | NOT NULL amount | NOT NULL preserved |
| payments.payments_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| payments.payments_currency_not_null | NOT NULL currency | NOT NULL preserved |
| payments.payments_id_not_null | NOT NULL id | NOT NULL preserved |
| payments.payments_idempotency_key_not_null | NOT NULL idempotency_key | NOT NULL preserved |
| payments.payments_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| payments.payments_order_id_idempotency_key_key | UNIQUE (order_id, idempotency_key) | Normalized unique key; generated discriminator for partial uniqueness |
| payments.payments_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| payments.payments_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| payments.payments_provider_not_null | NOT NULL provider | NOT NULL preserved |
| payments.payments_refund_within_amount | CHECK ((refunded_amount <= amount)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| payments.payments_refunded_amount_check | CHECK ((refunded_amount >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| payments.payments_refunded_amount_not_null | NOT NULL refunded_amount | NOT NULL preserved |
| payments.payments_status_not_null | NOT NULL status | NOT NULL preserved |
| permissions.permissions_group_not_null | NOT NULL "group" | NOT NULL preserved |
| permissions.permissions_key_check | CHECK ((key ~ '^[a-z_]+:[a-z_]+$'::text)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| permissions.permissions_key_not_null | NOT NULL key | NOT NULL preserved |
| permissions.permissions_label_not_null | NOT NULL label | NOT NULL preserved |
| permissions.permissions_pkey | PRIMARY KEY (key) | Same PK, UUID columns BINARY(16) |
| permissions.permissions_sensitive_not_null | NOT NULL sensitive | NOT NULL preserved |
| price_lists.price_lists_check | CHECK (((ends_at IS NULL) OR (starts_at IS NULL) OR (ends_at > starts_at))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| price_lists.price_lists_code_not_null | NOT NULL code | NOT NULL preserved |
| price_lists.price_lists_currency_not_null | NOT NULL currency | NOT NULL preserved |
| price_lists.price_lists_id_not_null | NOT NULL id | NOT NULL preserved |
| price_lists.price_lists_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| price_lists.price_lists_priority_not_null | NOT NULL priority | NOT NULL preserved |
| price_lists.price_lists_store_id_code_key | UNIQUE (store_id, code) | Normalized unique key; generated discriminator for partial uniqueness |
| price_lists.price_lists_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| price_lists.price_lists_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| prices.prices_amount_check | CHECK ((amount >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| prices.prices_amount_not_null | NOT NULL amount | NOT NULL preserved |
| prices.prices_check | CHECK (((compare_at IS NULL) OR (compare_at > amount))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| prices.prices_pkey | PRIMARY KEY (price_list_id, variant_id) | Same PK, UUID columns BINARY(16) |
| prices.prices_price_list_id_fkey | FOREIGN KEY (price_list_id) REFERENCES price_lists(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| prices.prices_price_list_id_not_null | NOT NULL price_list_id | NOT NULL preserved |
| prices.prices_variant_id_fkey | FOREIGN KEY (variant_id) REFERENCES variants(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| prices.prices_variant_id_not_null | NOT NULL variant_id | NOT NULL preserved |
| product_images.product_images_alt_not_null | NOT NULL alt | NOT NULL preserved |
| product_images.product_images_height_check | CHECK ((height > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| product_images.product_images_height_not_null | NOT NULL height | NOT NULL preserved |
| product_images.product_images_id_not_null | NOT NULL id | NOT NULL preserved |
| product_images.product_images_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| product_images.product_images_position_not_null | NOT NULL "position" | NOT NULL preserved |
| product_images.product_images_product_id_fkey | FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| product_images.product_images_product_id_not_null | NOT NULL product_id | NOT NULL preserved |
| product_images.product_images_role_not_null | NOT NULL role | NOT NULL preserved |
| product_images.product_images_url_not_null | NOT NULL url | NOT NULL preserved |
| product_images.product_images_width_check | CHECK ((width > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| product_images.product_images_width_not_null | NOT NULL width | NOT NULL preserved |
| products.products_attributes_not_null | NOT NULL attributes | NOT NULL preserved |
| products.products_brand_id_fkey | FOREIGN KEY (brand_id) REFERENCES brands(id) | Equivalent FK, explicit delete rule and supporting index |
| products.products_brand_id_not_null | NOT NULL brand_id | NOT NULL preserved |
| products.products_check | CHECK (((kind = 'preloved'::product_kind) = (condition_grade IS NOT NULL))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| products.products_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| products.products_custom_fields_not_null | NOT NULL custom_fields | NOT NULL preserved |
| products.products_description_not_null | NOT NULL description | NOT NULL preserved |
| products.products_gender_not_null | NOT NULL gender | NOT NULL preserved |
| products.products_id_not_null | NOT NULL id | NOT NULL preserved |
| products.products_kind_not_null | NOT NULL kind | NOT NULL preserved |
| products.products_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| products.products_position_not_null | NOT NULL "position" | NOT NULL preserved |
| products.products_published_at_not_null | NOT NULL published_at | NOT NULL preserved |
| products.products_seo_not_null | NOT NULL seo | NOT NULL preserved |
| products.products_slug_not_null | NOT NULL slug | NOT NULL preserved |
| products.products_status_not_null | NOT NULL status | NOT NULL preserved |
| products.products_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| products.products_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| products.products_store_id_slug_key | UNIQUE (store_id, slug) | Normalized unique key; generated discriminator for partial uniqueness |
| products.products_tags_not_null | NOT NULL tags | NOT NULL preserved |
| products.products_title_not_null | NOT NULL title | NOT NULL preserved |
| products.products_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_at_not_null | NOT NULL at | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE SET NULL | Equivalent FK, explicit delete rule and supporting index |
| promotion_redemptions.promotion_redemptions_email_check | CHECK ((email = lower(email))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| promotion_redemptions.promotion_redemptions_email_not_null | NOT NULL email | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_id_not_null | NOT NULL id | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| promotion_redemptions.promotion_redemptions_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| promotion_redemptions.promotion_redemptions_promotion_id_fkey | FOREIGN KEY (promotion_id) REFERENCES promotions(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| promotion_redemptions.promotion_redemptions_promotion_id_not_null | NOT NULL promotion_id | NOT NULL preserved |
| promotion_redemptions.promotion_redemptions_promotion_id_order_id_key | UNIQUE (promotion_id, order_id) | Normalized unique key; generated discriminator for partial uniqueness |
| promotions.promotions_actions_not_null | NOT NULL actions | NOT NULL preserved |
| promotions.promotions_active_not_null | NOT NULL active | NOT NULL preserved |
| promotions.promotions_combinable_not_null | NOT NULL combinable | NOT NULL preserved |
| promotions.promotions_conditions_not_null | NOT NULL conditions | NOT NULL preserved |
| promotions.promotions_id_not_null | NOT NULL id | NOT NULL preserved |
| promotions.promotions_per_customer_limit_check | CHECK (((per_customer_limit IS NULL) OR (per_customer_limit > 0))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| promotions.promotions_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| promotions.promotions_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| promotions.promotions_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| promotions.promotions_times_used_check | CHECK ((times_used >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| promotions.promotions_times_used_not_null | NOT NULL times_used | NOT NULL preserved |
| promotions.promotions_title_not_null | NOT NULL title | NOT NULL preserved |
| promotions.promotions_usage_limit_check | CHECK (((usage_limit IS NULL) OR (usage_limit > 0))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| promotions.promotions_usage_within_limit | CHECK (((usage_limit IS NULL) OR (times_used <= usage_limit))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| rate_limits.rate_limits_count_not_null | NOT NULL count | NOT NULL preserved |
| rate_limits.rate_limits_key_not_null | NOT NULL key | NOT NULL preserved |
| rate_limits.rate_limits_pkey | PRIMARY KEY (key) | Same PK, UUID columns BINARY(16) |
| rate_limits.rate_limits_window_start_not_null | NOT NULL window_start | NOT NULL preserved |
| refunds.refunds_amount_check | CHECK ((amount > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| refunds.refunds_amount_not_null | NOT NULL amount | NOT NULL preserved |
| refunds.refunds_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| refunds.refunds_id_not_null | NOT NULL id | NOT NULL preserved |
| refunds.refunds_idempotency_key_not_null | NOT NULL idempotency_key | NOT NULL preserved |
| refunds.refunds_lines_not_null | NOT NULL lines | NOT NULL preserved |
| refunds.refunds_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| refunds.refunds_order_id_idempotency_key_key | UNIQUE (order_id, idempotency_key) | Normalized unique key; generated discriminator for partial uniqueness |
| refunds.refunds_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| refunds.refunds_payment_id_fkey | FOREIGN KEY (payment_id) REFERENCES payments(id) | Equivalent FK, explicit delete rule and supporting index |
| refunds.refunds_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| refunds.refunds_reason_not_null | NOT NULL reason | NOT NULL preserved |
| refunds.refunds_restock_not_null | NOT NULL restock | NOT NULL preserved |
| returns.returns_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| returns.returns_id_not_null | NOT NULL id | NOT NULL preserved |
| returns.returns_lines_not_null | NOT NULL lines | NOT NULL preserved |
| returns.returns_order_id_fkey | FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| returns.returns_order_id_not_null | NOT NULL order_id | NOT NULL preserved |
| returns.returns_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| returns.returns_reason_not_null | NOT NULL reason | NOT NULL preserved |
| returns.returns_status_not_null | NOT NULL status | NOT NULL preserved |
| role_permissions.role_permissions_permission_fkey | FOREIGN KEY (permission) REFERENCES permissions(key) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| role_permissions.role_permissions_permission_not_null | NOT NULL permission | NOT NULL preserved |
| role_permissions.role_permissions_pkey | PRIMARY KEY (role_id, permission) | Same PK, UUID columns BINARY(16) |
| role_permissions.role_permissions_role_id_fkey | FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| role_permissions.role_permissions_role_id_not_null | NOT NULL role_id | NOT NULL preserved |
| roles.roles_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| roles.roles_description_not_null | NOT NULL description | NOT NULL preserved |
| roles.roles_id_not_null | NOT NULL id | NOT NULL preserved |
| roles.roles_is_system_not_null | NOT NULL is_system | NOT NULL preserved |
| roles.roles_key_check | CHECK ((key ~ '^[a-z0-9_]{2,40}$'::text)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| roles.roles_key_not_null | NOT NULL key | NOT NULL preserved |
| roles.roles_name_check | CHECK (((length(name) >= 1) AND (length(name) <= 60))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| roles.roles_name_not_null | NOT NULL name | NOT NULL preserved |
| roles.roles_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| roles.roles_refund_limit_check | CHECK (((refund_limit IS NULL) OR (refund_limit >= 0))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| roles.roles_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| roles.roles_store_id_key_key | UNIQUE (store_id, key) | Normalized unique key; generated discriminator for partial uniqueness |
| roles.roles_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| roles.roles_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| search_queries.search_queries_check | CHECK (((result_count IS NULL) <> (clicked_slug IS NULL))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_queries.search_queries_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| search_queries.search_queries_id_not_null | NOT NULL id | NOT NULL preserved |
| search_queries.search_queries_normalized_check | CHECK (((length(normalized) >= 1) AND (length(normalized) <= 100))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_queries.search_queries_normalized_not_null | NOT NULL normalized | NOT NULL preserved |
| search_queries.search_queries_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| search_queries.search_queries_query_check | CHECK (((length(query) >= 1) AND (length(query) <= 100))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_queries.search_queries_query_not_null | NOT NULL query | NOT NULL preserved |
| search_queries.search_queries_result_count_check | CHECK ((result_count >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_queries.search_queries_source_check | CHECK ((source = ANY (ARRAY['overlay'::text, 'page'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_queries.search_queries_source_not_null | NOT NULL source | NOT NULL preserved |
| search_queries.search_queries_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| search_queries.search_queries_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| search_synonyms.search_synonyms_id_not_null | NOT NULL id | NOT NULL preserved |
| search_synonyms.search_synonyms_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| search_synonyms.search_synonyms_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| search_synonyms.search_synonyms_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| search_synonyms.search_synonyms_store_id_term_key | UNIQUE (store_id, term) | Normalized unique key; generated discriminator for partial uniqueness |
| search_synonyms.search_synonyms_synonyms_check | CHECK ((cardinality(synonyms) > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_synonyms.search_synonyms_synonyms_not_null | NOT NULL synonyms | NOT NULL preserved |
| search_synonyms.search_synonyms_term_check | CHECK ((length(TRIM(BOTH FROM term)) > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| search_synonyms.search_synonyms_term_not_null | NOT NULL term | NOT NULL preserved |
| sessions.sessions_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| sessions.sessions_customer_id_fkey | FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| sessions.sessions_customer_id_not_null | NOT NULL customer_id | NOT NULL preserved |
| sessions.sessions_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| sessions.sessions_pkey | PRIMARY KEY (token_hash) | Same PK, UUID columns BINARY(16) |
| sessions.sessions_token_hash_not_null | NOT NULL token_hash | NOT NULL preserved |
| shipping_rates.shipping_rates_amount_check | CHECK ((amount >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| shipping_rates.shipping_rates_amount_not_null | NOT NULL amount | NOT NULL preserved |
| shipping_rates.shipping_rates_cash_on_delivery_not_null | NOT NULL cash_on_delivery | NOT NULL preserved |
| shipping_rates.shipping_rates_check | CHECK ((max_days >= min_days)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| shipping_rates.shipping_rates_code_not_null | NOT NULL code | NOT NULL preserved |
| shipping_rates.shipping_rates_free_over_check | CHECK (((free_over IS NULL) OR (free_over > 0))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| shipping_rates.shipping_rates_id_not_null | NOT NULL id | NOT NULL preserved |
| shipping_rates.shipping_rates_label_not_null | NOT NULL label | NOT NULL preserved |
| shipping_rates.shipping_rates_max_days_not_null | NOT NULL max_days | NOT NULL preserved |
| shipping_rates.shipping_rates_min_days_check | CHECK ((min_days >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| shipping_rates.shipping_rates_min_days_not_null | NOT NULL min_days | NOT NULL preserved |
| shipping_rates.shipping_rates_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| shipping_rates.shipping_rates_zone_id_code_key | UNIQUE (zone_id, code) | Normalized unique key; generated discriminator for partial uniqueness |
| shipping_rates.shipping_rates_zone_id_fkey | FOREIGN KEY (zone_id) REFERENCES shipping_zones(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| shipping_rates.shipping_rates_zone_id_not_null | NOT NULL zone_id | NOT NULL preserved |
| shipping_zones.shipping_zones_cities_not_null | NOT NULL cities | NOT NULL preserved |
| shipping_zones.shipping_zones_countries_not_null | NOT NULL countries | NOT NULL preserved |
| shipping_zones.shipping_zones_id_not_null | NOT NULL id | NOT NULL preserved |
| shipping_zones.shipping_zones_name_not_null | NOT NULL name | NOT NULL preserved |
| shipping_zones.shipping_zones_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| shipping_zones.shipping_zones_position_not_null | NOT NULL "position" | NOT NULL preserved |
| shipping_zones.shipping_zones_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| shipping_zones.shipping_zones_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| staff_invites.staff_invites_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| staff_invites.staff_invites_email_not_null | NOT NULL email | NOT NULL preserved |
| staff_invites.staff_invites_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| staff_invites.staff_invites_id_not_null | NOT NULL id | NOT NULL preserved |
| staff_invites.staff_invites_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| staff_invites.staff_invites_role_key_not_null | NOT NULL role_key | NOT NULL preserved |
| staff_invites.staff_invites_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| staff_invites.staff_invites_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| staff_invites.staff_invites_token_hash_key | UNIQUE (token_hash) | Normalized unique key; generated discriminator for partial uniqueness |
| staff_invites.staff_invites_token_hash_not_null | NOT NULL token_hash | NOT NULL preserved |
| staff_members.staff_members_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| staff_members.staff_members_display_name_not_null | NOT NULL display_name | NOT NULL preserved |
| staff_members.staff_members_failed_logins_check | CHECK ((failed_logins >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| staff_members.staff_members_failed_logins_not_null | NOT NULL failed_logins | NOT NULL preserved |
| staff_members.staff_members_keep_owner | TRIGGER DEFERRABLE INITIALLY DEFERRED | Last-Owner transaction/store-row guard; no trigger dependency |
| staff_members.staff_members_pkey | PRIMARY KEY (user_id, store_id) | Same PK, UUID columns BINARY(16) |
| staff_members.staff_members_recovery_codes_not_null | NOT NULL recovery_codes | NOT NULL preserved |
| staff_members.staff_members_status_check | CHECK ((status = ANY (ARRAY['invited'::text, 'active'::text, 'suspended'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| staff_members.staff_members_status_not_null | NOT NULL status | NOT NULL preserved |
| staff_members.staff_members_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| staff_members.staff_members_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| staff_members.staff_members_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| staff_members.staff_members_user_id_not_null | NOT NULL user_id | NOT NULL preserved |
| staff_roles.staff_roles_keep_owner | TRIGGER DEFERRABLE INITIALLY DEFERRED | Last-Owner transaction/store-row guard; no trigger dependency |
| staff_roles.staff_roles_pkey | PRIMARY KEY (user_id, store_id, role_id) | Same PK, UUID columns BINARY(16) |
| staff_roles.staff_roles_role_id_fkey | FOREIGN KEY (role_id) REFERENCES roles(id) ON DELETE RESTRICT | Equivalent FK, explicit delete rule and supporting index |
| staff_roles.staff_roles_role_id_not_null | NOT NULL role_id | NOT NULL preserved |
| staff_roles.staff_roles_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| staff_roles.staff_roles_user_id_not_null | NOT NULL user_id | NOT NULL preserved |
| staff_roles.staff_roles_user_id_store_id_fkey | FOREIGN KEY (user_id, store_id) REFERENCES staff_members(user_id, store_id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| staff_sessions.staff_sessions_aal_check | CHECK ((aal = ANY (ARRAY[1, 2]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| staff_sessions.staff_sessions_aal_not_null | NOT NULL aal | NOT NULL preserved |
| staff_sessions.staff_sessions_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| staff_sessions.staff_sessions_expires_at_not_null | NOT NULL expires_at | NOT NULL preserved |
| staff_sessions.staff_sessions_id_not_null | NOT NULL id | NOT NULL preserved |
| staff_sessions.staff_sessions_last_seen_at_not_null | NOT NULL last_seen_at | NOT NULL preserved |
| staff_sessions.staff_sessions_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| staff_sessions.staff_sessions_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| staff_sessions.staff_sessions_token_hash_key | UNIQUE (token_hash) | Normalized unique key; generated discriminator for partial uniqueness |
| staff_sessions.staff_sessions_token_hash_not_null | NOT NULL token_hash | NOT NULL preserved |
| staff_sessions.staff_sessions_user_id_not_null | NOT NULL user_id | NOT NULL preserved |
| staff_sessions.staff_sessions_user_id_store_id_fkey | FOREIGN KEY (user_id, store_id) REFERENCES staff_members(user_id, store_id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| storefront_content.storefront_content_content_check | CHECK ((jsonb_typeof(content) = 'object'::text)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| storefront_content.storefront_content_content_not_null | NOT NULL content | NOT NULL preserved |
| storefront_content.storefront_content_pkey | PRIMARY KEY (store_id) | Same PK, UUID columns BINARY(16) |
| storefront_content.storefront_content_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) | Equivalent FK, explicit delete rule and supporting index |
| storefront_content.storefront_content_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| storefront_content.storefront_content_updated_at_not_null | NOT NULL updated_at | NOT NULL preserved |
| stores.stores_created_at_not_null | NOT NULL created_at | NOT NULL preserved |
| stores.stores_default_currency_not_null | NOT NULL default_currency | NOT NULL preserved |
| stores.stores_id_not_null | NOT NULL id | NOT NULL preserved |
| stores.stores_name_not_null | NOT NULL name | NOT NULL preserved |
| stores.stores_next_order_number_check | CHECK ((next_order_number > 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| stores.stores_next_order_number_not_null | NOT NULL next_order_number | NOT NULL preserved |
| stores.stores_order_prefix_not_null | NOT NULL order_prefix | NOT NULL preserved |
| stores.stores_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| tax_rates.tax_rates_basis_points_check | CHECK (((basis_points >= 0) AND (basis_points <= 10000))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| tax_rates.tax_rates_basis_points_not_null | NOT NULL basis_points | NOT NULL preserved |
| tax_rates.tax_rates_country_not_null | NOT NULL country | NOT NULL preserved |
| tax_rates.tax_rates_id_not_null | NOT NULL id | NOT NULL preserved |
| tax_rates.tax_rates_inclusive_not_null | NOT NULL inclusive | NOT NULL preserved |
| tax_rates.tax_rates_label_not_null | NOT NULL label | NOT NULL preserved |
| tax_rates.tax_rates_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| tax_rates.tax_rates_store_id_fkey | FOREIGN KEY (store_id) REFERENCES stores(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| tax_rates.tax_rates_store_id_not_null | NOT NULL store_id | NOT NULL preserved |
| variants.variants_attributes_not_null | NOT NULL attributes | NOT NULL preserved |
| variants.variants_id_not_null | NOT NULL id | NOT NULL preserved |
| variants.variants_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| variants.variants_position_not_null | NOT NULL "position" | NOT NULL preserved |
| variants.variants_product_id_fkey | FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| variants.variants_product_id_not_null | NOT NULL product_id | NOT NULL preserved |
| variants.variants_size_cm_not_null | NOT NULL size_cm | NOT NULL preserved |
| variants.variants_size_eu_not_null | NOT NULL size_eu | NOT NULL preserved |
| variants.variants_size_uk_not_null | NOT NULL size_uk | NOT NULL preserved |
| variants.variants_size_us_not_null | NOT NULL size_us | NOT NULL preserved |
| variants.variants_sku_key | UNIQUE (sku) | Normalized unique key; generated discriminator for partial uniqueness |
| variants.variants_sku_not_null | NOT NULL sku | NOT NULL preserved |
| variants.variants_weight_grams_check | CHECK ((weight_grams >= 0)) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| variants.variants_weight_grams_not_null | NOT NULL weight_grams | NOT NULL preserved |
| webhook_deliveries.webhook_deliveries_at_not_null | NOT NULL at | NOT NULL preserved |
| webhook_deliveries.webhook_deliveries_endpoint_not_null | NOT NULL endpoint | NOT NULL preserved |
| webhook_deliveries.webhook_deliveries_event_id_fkey | FOREIGN KEY (event_id) REFERENCES outbox_events(id) ON DELETE CASCADE | Equivalent FK, explicit delete rule and supporting index |
| webhook_deliveries.webhook_deliveries_event_id_not_null | NOT NULL event_id | NOT NULL preserved |
| webhook_deliveries.webhook_deliveries_id_not_null | NOT NULL id | NOT NULL preserved |
| webhook_deliveries.webhook_deliveries_pkey | PRIMARY KEY (id) | Same PK, UUID columns BINARY(16) |
| webhook_deliveries.webhook_deliveries_status_check | CHECK ((status = ANY (ARRAY['delivered'::text, 'failed'::text]))) | Portable CHECK; JSON/array-specific rules use normalized children and validated transactional writes |
| webhook_deliveries.webhook_deliveries_status_not_null | NOT NULL status | NOT NULL preserved |

## Every index (M1/M6/M10)

| Table/name | Existing definition | Replacement |
| --- | --- | --- |
| addresses.addresses_one_default | CREATE UNIQUE INDEX addresses_one_default ON public.addresses USING btree (customer_id) WHERE is_default | Nullable generated discriminator + composite index |
| addresses.addresses_pkey | CREATE UNIQUE INDEX addresses_pkey ON public.addresses USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| attribute_definitions.attribute_definitions_pkey | CREATE UNIQUE INDEX attribute_definitions_pkey ON public.attribute_definitions USING btree (store_id, code) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| audit_log.audit_log_actor | CREATE INDEX audit_log_actor ON public.audit_log USING btree (store_id, actor, at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| audit_log.audit_log_entity | CREATE INDEX audit_log_entity ON public.audit_log USING btree (entity, entity_id, at) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| audit_log.audit_log_pkey | CREATE UNIQUE INDEX audit_log_pkey ON public.audit_log USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| audit_log.audit_log_store_at | CREATE INDEX audit_log_store_at ON public.audit_log USING btree (store_id, at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| brands.brands_pkey | CREATE UNIQUE INDEX brands_pkey ON public.brands USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| brands.brands_store_id_slug_key | CREATE UNIQUE INDEX brands_store_id_slug_key ON public.brands USING btree (store_id, slug) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| cart_lines.cart_lines_cart_id_variant_id_key | CREATE UNIQUE INDEX cart_lines_cart_id_variant_id_key ON public.cart_lines USING btree (cart_id, variant_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| cart_lines.cart_lines_pkey | CREATE UNIQUE INDEX cart_lines_pkey ON public.cart_lines USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| carts.carts_customer | CREATE INDEX carts_customer ON public.carts USING btree (store_id, customer_id) WHERE (status = 'active'::cart_status) | Nullable generated discriminator + composite index |
| carts.carts_pkey | CREATE UNIQUE INDEX carts_pkey ON public.carts USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| carts.carts_token | CREATE INDEX carts_token ON public.carts USING btree (store_id, token_hash) WHERE (status = 'active'::cart_status) | Nullable generated discriminator + composite index |
| collection_products.collection_products_pkey | CREATE UNIQUE INDEX collection_products_pkey ON public.collection_products USING btree (collection_id, product_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| collection_products.collection_products_product | CREATE INDEX collection_products_product ON public.collection_products USING btree (product_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| collections.collections_pkey | CREATE UNIQUE INDEX collections_pkey ON public.collections USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| collections.collections_store_id_slug_key | CREATE UNIQUE INDEX collections_store_id_slug_key ON public.collections USING btree (store_id, slug) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| contact_messages.contact_messages_pkey | CREATE UNIQUE INDEX contact_messages_pkey ON public.contact_messages USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| custom_field_definitions.custom_field_definitions_pkey | CREATE UNIQUE INDEX custom_field_definitions_pkey ON public.custom_field_definitions USING btree (store_id, entity, code) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| customers.customers_pkey | CREATE UNIQUE INDEX customers_pkey ON public.customers USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| customers.customers_store_id_email_key | CREATE UNIQUE INDEX customers_store_id_email_key ON public.customers USING btree (store_id, email) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| exchange_rates.exchange_rates_pkey | CREATE UNIQUE INDEX exchange_rates_pkey ON public.exchange_rates USING btree (store_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| faqs.faqs_pkey | CREATE UNIQUE INDEX faqs_pkey ON public.faqs USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| feature_flags.feature_flags_pkey | CREATE UNIQUE INDEX feature_flags_pkey ON public.feature_flags USING btree (store_id, key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| idempotency_keys.idempotency_keys_pkey | CREATE UNIQUE INDEX idempotency_keys_pkey ON public.idempotency_keys USING btree (key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| inventory_levels.inventory_levels_pkey | CREATE UNIQUE INDEX inventory_levels_pkey ON public.inventory_levels USING btree (variant_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| inventory_movements.inventory_movements_pkey | CREATE UNIQUE INDEX inventory_movements_pkey ON public.inventory_movements USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| inventory_reservations.inventory_reservations_cart | CREATE INDEX inventory_reservations_cart ON public.inventory_reservations USING btree (cart_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| inventory_reservations.inventory_reservations_expiry | CREATE INDEX inventory_reservations_expiry ON public.inventory_reservations USING btree (expires_at) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| inventory_reservations.inventory_reservations_pkey | CREATE UNIQUE INDEX inventory_reservations_pkey ON public.inventory_reservations USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| media.media_path_key | CREATE UNIQUE INDEX media_path_key ON public.media USING btree (path) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| media.media_pkey | CREATE UNIQUE INDEX media_pkey ON public.media USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| media.media_store_created | CREATE INDEX media_store_created ON public.media USING btree (store_id, created_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| newsletter_subscribers.newsletter_subscribers_pkey | CREATE UNIQUE INDEX newsletter_subscribers_pkey ON public.newsletter_subscribers USING btree (store_id, email) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| order_lines.order_lines_image_url | CREATE INDEX order_lines_image_url ON public.order_lines USING btree (image_url, order_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| order_lines.order_lines_order | CREATE INDEX order_lines_order ON public.order_lines USING btree (order_id, "position") | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| order_lines.order_lines_pkey | CREATE UNIQUE INDEX order_lines_pkey ON public.order_lines USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| order_notes.order_notes_order | CREATE INDEX order_notes_order ON public.order_notes USING btree (order_id, created_at) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| order_notes.order_notes_pkey | CREATE UNIQUE INDEX order_notes_pkey ON public.order_notes USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_customer | CREATE INDEX orders_customer ON public.orders USING btree (store_id, customer_id, placed_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_email | CREATE INDEX orders_email ON public.orders USING btree (store_id, lower(email)) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_pkey | CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_store_id_idempotency_key_key | CREATE UNIQUE INDEX orders_store_id_idempotency_key_key ON public.orders USING btree (store_id, idempotency_key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_store_id_number_key | CREATE UNIQUE INDEX orders_store_id_number_key ON public.orders USING btree (store_id, number) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_store_payment | CREATE INDEX orders_store_payment ON public.orders USING btree (store_id, payment_status, placed_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_store_placed | CREATE INDEX orders_store_placed ON public.orders USING btree (store_id, placed_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| orders.orders_store_status | CREATE INDEX orders_store_status ON public.orders USING btree (store_id, status, placed_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| outbox_events.outbox_due | CREATE INDEX outbox_due ON public.outbox_events USING btree (available_at) WHERE (status = 'pending'::outbox_status) | Nullable generated discriminator + composite index |
| outbox_events.outbox_events_pkey | CREATE UNIQUE INDEX outbox_events_pkey ON public.outbox_events USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| pages.pages_pkey | CREATE UNIQUE INDEX pages_pkey ON public.pages USING btree (store_id, slug) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| password_resets.password_resets_pkey | CREATE UNIQUE INDEX password_resets_pkey ON public.password_resets USING btree (token_hash) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| payments.payments_order_id_idempotency_key_key | CREATE UNIQUE INDEX payments_order_id_idempotency_key_key ON public.payments USING btree (order_id, idempotency_key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| payments.payments_pkey | CREATE UNIQUE INDEX payments_pkey ON public.payments USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| permissions.permissions_pkey | CREATE UNIQUE INDEX permissions_pkey ON public.permissions USING btree (key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| price_lists.price_lists_pkey | CREATE UNIQUE INDEX price_lists_pkey ON public.price_lists USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| price_lists.price_lists_store_id_code_key | CREATE UNIQUE INDEX price_lists_store_id_code_key ON public.price_lists USING btree (store_id, code) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| prices.prices_pkey | CREATE UNIQUE INDEX prices_pkey ON public.prices USING btree (price_list_id, variant_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| prices.prices_variant | CREATE INDEX prices_variant ON public.prices USING btree (variant_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| product_images.product_images_pkey | CREATE UNIQUE INDEX product_images_pkey ON public.product_images USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| product_images.product_images_product | CREATE INDEX product_images_product ON public.product_images USING btree (product_id, "position") | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| products.products_pkey | CREATE UNIQUE INDEX products_pkey ON public.products USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| products.products_store_id_slug_key | CREATE UNIQUE INDEX products_store_id_slug_key ON public.products USING btree (store_id, slug) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| products.products_store_status_position | CREATE INDEX products_store_status_position ON public.products USING btree (store_id, status, "position") | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| products.products_title_trgm_idx | CREATE INDEX products_title_trgm_idx ON public.products USING gin (lower(title) extensions.gin_trgm_ops) | FULLTEXT search_documents / indexed attribute projection |
| promotion_redemptions.promotion_redemptions_email | CREATE INDEX promotion_redemptions_email ON public.promotion_redemptions USING btree (promotion_id, email) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| promotion_redemptions.promotion_redemptions_pkey | CREATE UNIQUE INDEX promotion_redemptions_pkey ON public.promotion_redemptions USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| promotion_redemptions.promotion_redemptions_promotion_id_order_id_key | CREATE UNIQUE INDEX promotion_redemptions_promotion_id_order_id_key ON public.promotion_redemptions USING btree (promotion_id, order_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| promotions.promotions_pkey | CREATE UNIQUE INDEX promotions_pkey ON public.promotions USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| promotions.promotions_store_code | CREATE UNIQUE INDEX promotions_store_code ON public.promotions USING btree (store_id, upper(code)) WHERE (code IS NOT NULL) | Nullable generated discriminator + composite index |
| rate_limits.rate_limits_pkey | CREATE UNIQUE INDEX rate_limits_pkey ON public.rate_limits USING btree (key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| refunds.refunds_order_id_idempotency_key_key | CREATE UNIQUE INDEX refunds_order_id_idempotency_key_key ON public.refunds USING btree (order_id, idempotency_key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| refunds.refunds_pkey | CREATE UNIQUE INDEX refunds_pkey ON public.refunds USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| returns.returns_one_open | CREATE UNIQUE INDEX returns_one_open ON public.returns USING btree (order_id) WHERE (status <> 'rejected'::return_status) | Nullable generated discriminator + composite index |
| returns.returns_pkey | CREATE UNIQUE INDEX returns_pkey ON public.returns USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| role_permissions.role_permissions_pkey | CREATE UNIQUE INDEX role_permissions_pkey ON public.role_permissions USING btree (role_id, permission) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| roles.roles_pkey | CREATE UNIQUE INDEX roles_pkey ON public.roles USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| roles.roles_store_id_key_key | CREATE UNIQUE INDEX roles_store_id_key_key ON public.roles USING btree (store_id, key) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| search_queries.search_queries_normalized_trgm_idx | CREATE INDEX search_queries_normalized_trgm_idx ON public.search_queries USING gin (normalized extensions.gin_trgm_ops) | FULLTEXT search_documents / indexed attribute projection |
| search_queries.search_queries_pkey | CREATE UNIQUE INDEX search_queries_pkey ON public.search_queries USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| search_queries.search_queries_trending_idx | CREATE INDEX search_queries_trending_idx ON public.search_queries USING btree (store_id, created_at DESC) WHERE (clicked_slug IS NULL) | Nullable generated discriminator + composite index |
| search_synonyms.search_synonyms_pkey | CREATE UNIQUE INDEX search_synonyms_pkey ON public.search_synonyms USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| search_synonyms.search_synonyms_store_id_term_key | CREATE UNIQUE INDEX search_synonyms_store_id_term_key ON public.search_synonyms USING btree (store_id, term) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| sessions.sessions_customer | CREATE INDEX sessions_customer ON public.sessions USING btree (customer_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| sessions.sessions_pkey | CREATE UNIQUE INDEX sessions_pkey ON public.sessions USING btree (token_hash) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| shipping_rates.shipping_rates_pkey | CREATE UNIQUE INDEX shipping_rates_pkey ON public.shipping_rates USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| shipping_rates.shipping_rates_zone_id_code_key | CREATE UNIQUE INDEX shipping_rates_zone_id_code_key ON public.shipping_rates USING btree (zone_id, code) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| shipping_zones.shipping_zones_pkey | CREATE UNIQUE INDEX shipping_zones_pkey ON public.shipping_zones USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_invites.staff_invites_pkey | CREATE UNIQUE INDEX staff_invites_pkey ON public.staff_invites USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_invites.staff_invites_store | CREATE INDEX staff_invites_store ON public.staff_invites USING btree (store_id, created_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_invites.staff_invites_token_hash_key | CREATE UNIQUE INDEX staff_invites_token_hash_key ON public.staff_invites USING btree (token_hash) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_members.staff_members_pkey | CREATE UNIQUE INDEX staff_members_pkey ON public.staff_members USING btree (user_id, store_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_members.staff_members_store_email | CREATE UNIQUE INDEX staff_members_store_email ON public.staff_members USING btree (store_id, lower(email)) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_roles.staff_roles_pkey | CREATE UNIQUE INDEX staff_roles_pkey ON public.staff_roles USING btree (user_id, store_id, role_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_roles.staff_roles_role | CREATE INDEX staff_roles_role ON public.staff_roles USING btree (role_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_sessions.staff_sessions_member | CREATE INDEX staff_sessions_member ON public.staff_sessions USING btree (store_id, user_id, last_seen_at DESC) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_sessions.staff_sessions_pkey | CREATE UNIQUE INDEX staff_sessions_pkey ON public.staff_sessions USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| staff_sessions.staff_sessions_token_hash_key | CREATE UNIQUE INDEX staff_sessions_token_hash_key ON public.staff_sessions USING btree (token_hash) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| storefront_content.storefront_content_pkey | CREATE UNIQUE INDEX storefront_content_pkey ON public.storefront_content USING btree (store_id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| stores.stores_pkey | CREATE UNIQUE INDEX stores_pkey ON public.stores USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| tax_rates.tax_rates_pkey | CREATE UNIQUE INDEX tax_rates_pkey ON public.tax_rates USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| variants.variants_pkey | CREATE UNIQUE INDEX variants_pkey ON public.variants USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| variants.variants_product | CREATE INDEX variants_product ON public.variants USING btree (product_id, "position") | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| variants.variants_sku_key | CREATE UNIQUE INDEX variants_sku_key ON public.variants USING btree (sku) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |
| webhook_deliveries.webhook_deliveries_pkey | CREATE UNIQUE INDEX webhook_deliveries_pkey ON public.webhook_deliveries USING btree (id) | Equivalent InnoDB B-tree/composite; EXPLAIN check at M10 |

## Every declared function/RPC (M2/M3/M5/M6)

| Source | Function | Replacement |
| --- | --- | --- |
| supabase/migrations/20261104090100_rls.sql:9 | staff_role | actor role resolution |
| supabase/migrations/20261104090100_rls.sql:21 | has_staff_role | actor role/permission predicates |
| supabase/migrations/20261104090100_rls.sql:159 | reject_audit_change | INSERT/SELECT-only app-user grants plus immutable repository API |
| supabase/migrations/20261104090200_functions.sql:10 | restore_reserved | inventory locked-counter reconciliation |
| supabase/migrations/20261104090200_functions.sql:32 | release_holds | inventory.release |
| supabase/migrations/20261104090200_functions.sql:51 | release_expired_reservations | inventory.releaseExpired |
| supabase/migrations/20261104090200_functions.sql:69 | reserve_stock | inventory.reserve |
| supabase/migrations/20261104090200_functions.sql:102 | stock_availability | inventory.availability |
| supabase/migrations/20261104090200_functions.sql:115 | adjust_stock | inventory.adjust |
| supabase/migrations/20261104090200_functions.sql:141 | restock | orders locked restock helper |
| supabase/migrations/20261104090200_functions.sql:163 | save_cart | cart.save |
| supabase/migrations/20261104090200_functions.sql:186 | merge_carts | cart.merge |
| supabase/migrations/20261104090200_functions.sql:231 | purge_abandoned_carts | cart.purgeAbandoned |
| supabase/migrations/20261104090200_functions.sql:258 | redeem_promotion | orders.placeOrder promotion transaction |
| supabase/migrations/20261104090200_functions.sql:284 | promotion_redemption_counts | promotions.redemptionsFor |
| supabase/migrations/20261104090200_functions.sql:298 | shopper_order_count | promotions.orderCountFor |
| supabase/migrations/20261104090200_functions.sql:311 | next_order_number | orders.nextOrderNumber / order_number_sequences locked row |
| supabase/migrations/20261104090200_functions.sql:332 | place_order | orders.placeOrder |
| supabase/migrations/20261104090200_functions.sql:423 | can_transition | orders/state-machine.ts canTransition |
| supabase/migrations/20261104090200_functions.sql:442 | status_event | orders state event mapping |
| supabase/migrations/20261104090200_functions.sql:452 | transition_order | orders.transition |
| supabase/migrations/20261104090200_functions.sql:497 | record_payment | orders.recordPayment |
| supabase/migrations/20261104090200_functions.sql:553 | create_refund | orders.createRefund |
| supabase/migrations/20261104090200_functions.sql:615 | create_return | orders.createReturn |
| supabase/migrations/20261104090200_functions.sql:648 | restock_return | orders.restockReturn |
| supabase/migrations/20261104090200_functions.sql:678 | anonymise_customer_orders | orders.anonymiseCustomer |
| supabase/migrations/20261104090200_functions.sql:701 | save_address | customers.saveAddress |
| supabase/migrations/20261104090200_functions.sql:732 | delete_address | customers.deleteAddress |
| supabase/migrations/20261104090200_functions.sql:753 | scrub_customer | customers.scrub |
| supabase/migrations/20261104090200_functions.sql:776 | subscribe_newsletter | content.subscribe |
| supabase/migrations/20261104090200_functions.sql:799 | import_products | catalog.upsertProducts |
| supabase/migrations/20261104090200_functions.sql:862 | claim_outbox_events | platform.claimDue |
| supabase/migrations/20261104090200_functions.sql:879 | fail_outbox_event | platform.markFailed |
| supabase/migrations/20261104090200_functions.sql:892 | rate_limit_hit | platform.hit |
| supabase/migrations/20261105090000_search.sql:39 | search_trending | search.trending |
| supabase/migrations/20261107090000_admin_foundation.sql:24 | touch_updated_at | DATETIME(3) ON UPDATE CURRENT_TIMESTAMP(3) |
| supabase/migrations/20261107090000_admin_foundation.sql:118 | has_permission | actor permission predicates |
| supabase/migrations/20261107090000_admin_foundation.sql:140 | active_owner_count | admin.countActiveOwners |
| supabase/migrations/20261107090000_admin_foundation.sql:156 | assert_store_keeps_owner | admin last-Owner guard under locked store row |
| supabase/migrations/20261107090000_admin_foundation.sql:194 | sync_admin_registry | admin.syncRegistry |
| supabase/migrations/20261107090000_admin_foundation.sql:223 | set_staff_roles | admin.setRoles |
| supabase/migrations/20261107090000_admin_foundation.sql:240 | save_role | admin.createRole/updateRole |
| supabase/migrations/20261107090000_admin_foundation.sql:270 | delete_role | admin.deleteRole |
| supabase/migrations/20261109090000_admin_catalog.sql:8 | save_product | catalog.saveProduct |
| supabase/migrations/20261109090000_admin_catalog.sql:92 | save_collection | catalog.saveCollection |
| supabase/migrations/20261110090000_admin_shipping.sql:4 | save_shipping_zone | shipping.saveZone |
| supabase/migrations/20261110090000_admin_shipping.sql:33 | replace_tax_rates | shipping.replaceTaxRates |
| supabase/migrations/20261111090000_admin_content.sql:4 | save_page | content.savePage |
| supabase/migrations/20261111090000_admin_content.sql:38 | reorder_faqs | content.reorderFaqs |
| supabase/migrations/20261112090000_admin_reports.sql:4 | search_report | search.report |
| supabase/migrations/20261114090000_storefront_content.sql:13 | save_home | content.saveHome |
| supabase/migrations/20261114090000_storefront_content.sql:32 | media_has_order_usage | media.hasOrderUsage |

## Every non-internal trigger (M1/M3/M5)

| Table/name | Existing definition | Replacement |
| --- | --- | --- |
| audit_log.audit_log_append_only | CREATE TRIGGER audit_log_append_only BEFORE DELETE OR UPDATE ON public.audit_log FOR EACH ROW EXECUTE FUNCTION reject_audit_change() | Append-only app-user grants and repository API |
| staff_members.staff_members_keep_owner | CREATE CONSTRAINT TRIGGER staff_members_keep_owner AFTER DELETE OR UPDATE OF status ON public.staff_members DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_store_keeps_owner() | Last-Owner transaction/store-row guard; no trigger dependency |
| staff_members.staff_members_touch | CREATE TRIGGER staff_members_touch BEFORE UPDATE ON public.staff_members FOR EACH ROW EXECUTE FUNCTION touch_updated_at() | DATETIME ON UPDATE, no trigger |
| staff_roles.staff_roles_keep_owner | CREATE CONSTRAINT TRIGGER staff_roles_keep_owner AFTER DELETE OR UPDATE ON public.staff_roles DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION assert_store_keeps_owner() | Last-Owner transaction/store-row guard; no trigger dependency |

## Every RLS policy (M5)

Each replacement is enforced in actor-scoped queries, never only route guards: published/active filters for public reads; store + owner/token for customers; permission + MFA and PII projection for staff; explicit bounded system purposes.

| Table/policy | Role/command | Existing predicate | Replacement |
| --- | --- | --- | --- |
| addresses.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM customers c   WHERE ((c.id = addresses.customer_id) AND has_staff_role(c.store_id, '{owner,manager,support}'::staff_role[])))) | server/customers/mysql.repository.ts actor predicate + ownership/permission matrix |
| attribute_definitions.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| attribute_definitions.storefront_read | ["anon","authenticated"] SELECT | true | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| audit_log.audit_read | ["authenticated"] SELECT | ((store_id IS NOT NULL) AND has_permission(store_id, 'audit:read'::text)) | server/platform/mysql.repository.ts actor predicate + ownership/permission matrix |
| audit_log.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM staff_members m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.role = ANY (ARRAY['owner'::staff_role, 'manager'::staff_role]))))) | server/platform/mysql.repository.ts actor predicate + ownership/permission matrix |
| brands.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| brands.storefront_read | ["anon","authenticated"] SELECT | true | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| collection_products.staff_manage | ["authenticated"] ALL | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = collection_products.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) / (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = collection_products.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| collection_products.storefront_read | ["anon","authenticated"] SELECT | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = collection_products.product_id) AND (p.status = 'active'::product_status)))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| collections.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| collections.storefront_read | ["anon","authenticated"] SELECT | true | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| contact_messages.staff_read | ["authenticated"] SELECT | has_staff_role(store_id, '{owner,manager,support}'::staff_role[]) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| custom_field_definitions.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| custom_field_definitions.storefront_read | ["anon","authenticated"] SELECT | visible_on_storefront | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| customers.staff_read | ["authenticated"] SELECT | has_staff_role(store_id, '{owner,manager,support}'::staff_role[]) | server/customers/mysql.repository.ts actor predicate + ownership/permission matrix |
| exchange_rates.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| exchange_rates.storefront_read | ["anon","authenticated"] SELECT | true | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| faqs.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| faqs.storefront_read | ["anon","authenticated"] SELECT | true | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| feature_flags.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/platform/mysql.repository.ts actor predicate + ownership/permission matrix |
| inventory_levels.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM (variants v      JOIN products p ON ((p.id = v.product_id)))   WHERE ((v.id = inventory_levels.variant_id) AND has_permission(p.store_id, 'inventory:read'::text)))) | server/inventory/mysql.repository.ts actor predicate + ownership/permission matrix |
| inventory_levels.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM (variants v      JOIN products p ON ((p.id = v.product_id)))   WHERE ((v.id = inventory_levels.variant_id) AND has_staff_role(p.store_id, '{owner,manager,fulfilment}'::staff_role[])))) | server/inventory/mysql.repository.ts actor predicate + ownership/permission matrix |
| inventory_movements.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM (variants v      JOIN products p ON ((p.id = v.product_id)))   WHERE ((v.id = inventory_movements.variant_id) AND has_permission(p.store_id, 'inventory:read'::text)))) | server/inventory/mysql.repository.ts actor predicate + ownership/permission matrix |
| inventory_movements.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM (variants v      JOIN products p ON ((p.id = v.product_id)))   WHERE ((v.id = inventory_movements.variant_id) AND has_staff_role(p.store_id, '{owner,manager,fulfilment}'::staff_role[])))) | server/inventory/mysql.repository.ts actor predicate + ownership/permission matrix |
| media.staff_read | ["authenticated"] SELECT | has_permission(store_id, 'media:read'::text) | server/media/mysql.repository.ts actor predicate + ownership/permission matrix |
| newsletter_subscribers.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'marketing:read'::text) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| newsletter_subscribers.staff_read | ["authenticated"] SELECT | has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| order_lines.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_lines.order_id) AND has_permission(o.store_id, 'orders:read'::text)))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| order_lines.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_lines.order_id) AND has_staff_role(o.store_id, '{owner,manager,fulfilment,support}'::staff_role[])))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| order_notes.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = order_notes.order_id) AND has_permission(o.store_id, 'orders:read'::text)))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| orders.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'orders:read'::text) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| orders.staff_read | ["authenticated"] SELECT | has_staff_role(store_id, '{owner,manager,fulfilment,support}'::staff_role[]) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| pages.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'content:read'::text) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| pages.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| pages.storefront_read | ["anon","authenticated"] SELECT | published | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| payments.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = payments.order_id) AND has_permission(o.store_id, 'payments:read'::text)))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| payments.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = payments.order_id) AND has_staff_role(o.store_id, '{owner,manager,support}'::staff_role[])))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| permissions.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM staff_members m   WHERE ((m.user_id = ( SELECT auth.uid() AS uid)) AND (m.status = 'active'::text)))) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| price_lists.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| price_lists.storefront_read | ["anon","authenticated"] SELECT | (((starts_at IS NULL) OR (starts_at <= now())) AND ((ends_at IS NULL) OR (ends_at > now()))) | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| prices.staff_manage | ["authenticated"] ALL | (EXISTS ( SELECT 1    FROM price_lists l   WHERE ((l.id = prices.price_list_id) AND has_staff_role(l.store_id, '{owner,manager}'::staff_role[])))) / (EXISTS ( SELECT 1    FROM price_lists l   WHERE ((l.id = prices.price_list_id) AND has_staff_role(l.store_id, '{owner,manager}'::staff_role[])))) | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| prices.storefront_read | ["anon","authenticated"] SELECT | (EXISTS ( SELECT 1    FROM (variants v      JOIN products p ON ((p.id = v.product_id)))   WHERE ((v.id = prices.variant_id) AND (p.status = 'active'::product_status)))) | server/pricing/mysql.repository.ts actor predicate + ownership/permission matrix |
| product_images.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_images.product_id) AND has_permission(p.store_id, 'products:read'::text)))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| product_images.staff_manage | ["authenticated"] ALL | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_images.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) / (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_images.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| product_images.storefront_read | ["anon","authenticated"] SELECT | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = product_images.product_id) AND (p.status = 'active'::product_status)))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| products.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'products:read'::text) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| products.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| products.storefront_read | ["anon","authenticated"] SELECT | (status = 'active'::product_status) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| promotion_redemptions.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM promotions p   WHERE ((p.id = promotion_redemptions.promotion_id) AND has_permission(p.store_id, 'promotions:read'::text)))) | server/promotions/mysql.repository.ts actor predicate + ownership/permission matrix |
| promotion_redemptions.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM promotions p   WHERE ((p.id = promotion_redemptions.promotion_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) | server/promotions/mysql.repository.ts actor predicate + ownership/permission matrix |
| promotions.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'promotions:read'::text) | server/promotions/mysql.repository.ts actor predicate + ownership/permission matrix |
| promotions.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/promotions/mysql.repository.ts actor predicate + ownership/permission matrix |
| refunds.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = refunds.order_id) AND has_permission(o.store_id, 'orders:read'::text)))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| refunds.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = refunds.order_id) AND has_staff_role(o.store_id, '{owner,manager,support}'::staff_role[])))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| returns.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = returns.order_id) AND has_permission(o.store_id, 'orders:read'::text)))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| returns.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM orders o   WHERE ((o.id = returns.order_id) AND has_staff_role(o.store_id, '{owner,manager,fulfilment,support}'::staff_role[])))) | server/orders/mysql.repository.ts actor predicate + ownership/permission matrix |
| role_permissions.staff_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM roles r   WHERE ((r.id = role_permissions.role_id) AND has_permission(r.store_id, 'staff:read'::text)))) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| roles.staff_read | ["authenticated"] SELECT | has_permission(store_id, 'staff:read'::text) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| search_queries.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'search:read'::text) | server/search/mysql.repository.ts actor predicate + ownership/permission matrix |
| search_queries.staff_read | ["authenticated"] SELECT | has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/search/mysql.repository.ts actor predicate + ownership/permission matrix |
| search_synonyms.staff_write | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/search/mysql.repository.ts actor predicate + ownership/permission matrix |
| search_synonyms.storefront_read | ["anon","authenticated"] SELECT | true | server/search/mysql.repository.ts actor predicate + ownership/permission matrix |
| shipping_rates.staff_manage | ["authenticated"] ALL | (EXISTS ( SELECT 1    FROM shipping_zones z   WHERE ((z.id = shipping_rates.zone_id) AND has_staff_role(z.store_id, '{owner,manager}'::staff_role[])))) / (EXISTS ( SELECT 1    FROM shipping_zones z   WHERE ((z.id = shipping_rates.zone_id) AND has_staff_role(z.store_id, '{owner,manager}'::staff_role[])))) | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| shipping_rates.storefront_read | ["anon","authenticated"] SELECT | true | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| shipping_zones.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| shipping_zones.storefront_read | ["anon","authenticated"] SELECT | true | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| staff_invites.staff_manage | ["authenticated"] ALL | has_permission(store_id, 'staff:manage'::text) / has_permission(store_id, 'staff:manage'::text) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| staff_members.own_membership | ["authenticated"] SELECT | (user_id = ( SELECT auth.uid() AS uid)) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| staff_members.owner_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner}'::staff_role[]) / has_staff_role(store_id, '{owner}'::staff_role[]) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| staff_roles.staff_read | ["authenticated"] SELECT | has_permission(store_id, 'staff:read'::text) | server/admin/mysql.repository.ts actor predicate + ownership/permission matrix |
| storefront_content.rbac_read | ["authenticated"] SELECT | has_permission(store_id, 'content:read'::text) | server/content/mysql.repository.ts actor predicate + ownership/permission matrix |
| stores.storefront_read | ["anon","authenticated"] SELECT | true | server/platform/mysql.repository.ts actor predicate + ownership/permission matrix |
| tax_rates.staff_manage | ["authenticated"] ALL | has_staff_role(store_id, '{owner,manager}'::staff_role[]) / has_staff_role(store_id, '{owner,manager}'::staff_role[]) | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| tax_rates.storefront_read | ["anon","authenticated"] SELECT | true | server/shipping/mysql.repository.ts actor predicate + ownership/permission matrix |
| variants.rbac_read | ["authenticated"] SELECT | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = variants.product_id) AND has_permission(p.store_id, 'products:read'::text)))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| variants.staff_manage | ["authenticated"] ALL | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = variants.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) / (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = variants.product_id) AND has_staff_role(p.store_id, '{owner,manager}'::staff_role[])))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |
| variants.storefront_read | ["anon","authenticated"] SELECT | (EXISTS ( SELECT 1    FROM products p   WHERE ((p.id = variants.product_id) AND (p.status = 'active'::product_status)))) | server/catalog/mysql.repository.ts actor predicate + ownership/permission matrix |

## Every repository method (M2/M3/M5)

- server/admin/repository.ts: findMemberByEmail, findMember, listMembers, createMember, updateMember, syncRegistry, listRoles, findRole, createRole, updateRole, deleteRole, rolesOf, setRoles, countActiveOwners, createInvite, findInviteByTokenHash, updateInvite, listInvites, createSession, findSessionByTokenHash, updateSession, listSessions, revokeSessions. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/cart/repository.ts: findByTokenHash, findById, findActiveByCustomer, create, save, merge, purgeAbandoned, listAbandoned. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/catalog/repository.ts: listProducts, getProductBySlug, getProductsByVariantIds, listCollections, listBrands, listAttributeDefinitions, listCustomFieldDefinitions, upsertProducts, searchProducts, getProductById, saveProduct, deleteProduct, saveCollection, deleteCollection, collectionProductIds, createBrand. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/content/repository.ts: home, saveHome, listPages, getPage, listFaqs, subscribe, unsubscribe, saveContactMessage, staffPages, staffPage, savePage, deletePage, saveFaq, deleteFaq, reorderFaqs, listSubscribers. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/customers/repository.ts: findByEmail, findById, create, update, createSession, findSession, deleteSession, deleteSessionsFor, createReset, consumeReset, listAddresses, saveAddress, deleteAddress, scrub, search. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/inventory/repository.ts: availability, reserve, release, onHand, releaseExpired, adjust, levels, movements. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/media/repository.ts: list, find, findById, create, updateAlt, remove, read, hasOrderUsage. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/orders/repository.ts: placeOrder, findByNumber, findById, findByIdempotencyKey, listByCustomer, listByEmail, transition, recordPayment, listPayments, createRefund, createReturn, restockReturn, listReturns, nextOrderNumber, search, listRefunds, decideReturn, addNote, listNotes, ledger, anonymiseCustomer. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/platform/repository.ts: listFlags, enqueue, claimDue, markDelivered, markFailed, recordDelivery, audit, listAudit, hit, getIdempotent, saveIdempotent, ping, setFlag, searchAudit, outboxSummary, retryEvent. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/pricing/repository.ts: listPriceLists, listPrices, getExchangeRates, upsertPrices. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/promotions/repository.ts: listActive, redemptionsFor, orderCountFor, listAll, find, save, remove, redemptions. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/search/repository.ts: listSynonyms, logEvent, trending, report, saveSynonym, deleteSynonym. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.
- server/shipping/repository.ts: listZones, listTaxRates, saveZone, deleteZone, replaceTaxRates. Signatures gain an explicit actor; fixture/MySQL contract preserves DTOs and behavior.

## Auth, storage, jobs and runtime

| Existing touchpoint | Replacement / stage |
| --- | --- |
| Customer login/signup/reset/profile/address/session/export/delete | Preserve screens/cookies, harden first-party primitives, actor-scoped persistence (M4/M5) |
| Staff invite/login/TOTP/recovery/AAL/step-up/revocation | Preserve identities/sealed MFA and separate cookies; maintained TOTP library; explicit freshness/revocation (M4/M5) |
| Supabase Auth SDK | No runtime use found; unused dependency/config removed (M8) |
| media Storage bucket upload/download/remove | Same public route; persistent external local-disk root, upload-time variants, S3/R2 reference, signed private reads (M6) |
| pg_trgm/search RPCs | FULLTEXT search_documents, search_terms vocabulary, prefix/SKU, service synonyms/typos, reference search adapter (M6) |
| Resend/console email | SMTP/nodemailer plus console/file sink; transactional outbox throttle/retry (M6) |
| rate_limit_hit | Atomic fixed-window upsert + cleanup job (M3/M6) |
| JOBS_SECRET; /api/jobs | CRON_SECRET; same routes, cron/external scheduler, bounded idempotent processing (M6) |
| Supabase Realtime | No subscriptions found; existing polling/revalidation preserved (M6) |
| @supabase/ssr; @supabase/supabase-js | Remove after repository acceptance; Drizzle + mysql2 replace transport (M8) |
| @electric-sql/pglite / legacy SQL tests | Port each invariant/RLS intent to real-engine contract/actor/grant tests before removal (M2/M5/M8) |
| SUPABASE_URL / service-role / NEXT_PUBLIC_SUPABASE_* | DATABASE_URL/pool/TLS; no browser database config (M1/M8) |
| SESSION_SECRET | AUTH_SECRET continuity import; no session/MFA loss (M4/M8) |
| standalone / Dockerfile / serve script | Locally built Hostinger artifact, PORT/HOSTNAME, external storage, no dev runtime deps (M9) |

## Frozen universal contracts

These are never edited; original digests guard the boundary.

| File | SHA-256 | Vendor-specific lines retained |
| --- | --- | --- |
| docs/ARCHITECTURE.md | 33db02e0b98e7d760fc3a61f0697428535e7a38475bfa76b833da271deb4a630 | None |
| docs/PROJECT-STRUCTURE.md | 5d6afed804f08017932760bcee20fe06e1d86a6d8fe355d4773fbff87263b76f | None |
| docs/UMDA-architecture-contract.md | a342a8684f57ea51a6f288d89a297fd02e2dce050e930d9f9f520dc8efbe9c96 | None |
| docs/state-management-contract.md | 5253460ccacd54f5215e567cbda733ca0dd12aaa3ca4a3eca50bb37ebe4ecf0d | None |
| docs/shadcn-component-contract.md | 8da8602c410a7dfc98f9852446b2a8be72b141249694176fde14f5936fdabbf2 | None |
| docs/layout-and-styling-contract.md | 8b66549ff62b18ce6d6a4ff436f8907f8f70f4e3e964da206145b1fee062f665 | None |
| docs/form-and-validation-contract.md | 34f1e125a74d82e58d6b1d89372ae1ade89ec003450b31be2ec88ec708b92003 | None |
| docs/comments-and-jsdoc-contract.md | d6179445de1d708e5e4629204befb2ca22f8fb08b6d22cb899a29e57ef64fb87 | None |
| docs/verification-contract.md | 4cbdf2dcafe71ce4984fa37480acf0e8632992234ce158556385a4780fae5f0e | None |
| docs/FIGMA-DESIGN-HANDOFF.md | 11dae95f875f5aab269056f74eebedaea27ea97815f7a23ee7d33954ade354ec | None |
| docs/CLAUD_PERMISSIONS.md | 42714070c441a3b26449bf7fc63f7bc3e34c2fb689528db0a2181d98168bbe85 | None |
| docs/DESIGN-GATHERING.md | 6f266b00f448a776fd14755aadced4f37f39e0cee776fa25f21295383a789eae | None |

## Complete source/config/test/doc mention ledger

Every matching tracked line follows. SQL ports at M1/M3; source/env/dependencies retire at M8; adapters at M6; test intent ports at M2/M5/M10; current product docs update at M8/M9. Changelog/inventory remain migration notes; universal contracts remain frozen.

| File:line | Existing mention | Replacement stage |
| --- | --- | --- |
| .env.example:5 | # local (saved to LOCAL_DATA_DIR; one server process) \| fixtures (isolated QA only) \| supabase | M1/M2/M6/M8 |
| .env.example:16 | # ── Database (DATA_DRIVER=supabase) ────────────────────────────────────────── | M1/M2/M6/M8 |
| .env.example:18 | # Server only: bypasses RLS | M1/M2/M6/M8 |
| .env.example:58 | # on = DEMO staff accounts (one per preset role) in the fixtures driver; never with supabase (A-011) | M1/M2/M6/M8 |
| README.md:12 | Run one server process per local data directory. Initial private Owner credentials for this migrated workspace are in ignored `.data/store/owner-bootstrap.json`; record them securely. New stores use `pnpm admin:create-owner` after configuring private secrets.  | M1/M2/M6/M8 |
| app/(admin)/admin/(shell)/settings/page.tsx:85 | <p className="text-16">Driver: {integrations.driver === "fixtures" ? "In-memory sample data (no database)" : integrations.driver === "local" ? "Saved local store" : "Supabase Postgres"}</p> | M1/M2/M6/M8 |
| docs/DEPLOYMENT-RUNBOOK.md:11 | \| Database \| `supabase/migrations/*.sql` (forward only) \| Postgres 15+ with the Supabase `auth` schema (RLS helpers use `auth.uid()`). \| | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:12 | \| Bootstrap \| `supabase/seed.sql` \| Empty store, retail price list, base-currency identity rate and disabled integration flags. Sample catalogue SQL and images live in `qa/fixtures` and are never production seeds. \| | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:21 | Required in production: `NEXT_PUBLIC_SITE_URL` (build argument), `DATA_DRIVER=supabase`, | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:32 | For saved local operation and banner controls, see [catalogue and banners](app/admin/catalogue-and-banners.md). `DATA_DRIVER=local` is a single-process local preview; hosted deployments use Supabase and remain stateless. | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:38 | `SUPABASE_SERVICE_ROLE_KEY` is read only by `server/db/supabase.ts` (enforced by | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:45 | 2. **Local Supabase** (needs Docker + Supabase CLI): `supabase start`, `supabase db reset` (migrations | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:46 | + seed), set `DATA_DRIVER=supabase`, `SUPABASE_URL=http://127.0.0.1:54321` and the printed | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:49 | `supabase link --project-ref <ref>` and `supabase db push`. Apply the minimal `supabase/seed.sql` | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:58 | 7. **Smoke**: `GET /api/health` → 200, `GET /api/ready` → 200 with `"driver":"supabase"`, place a COD | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:90 | - **Backups**: Supabase point-in-time recovery on the hosted plan; test a restore before launch. | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:100 | Push a migration that disables RLS; edit an applied migration; run `seed.sql` on production; expose the | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:109 | - **First Owner, local Supabase**: `pnpm admin:create-owner --email you@example.com` writes a one-time | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:112 | - **First Owner, hosted database**: in the Supabase SQL editor, insert the invite yourself (the token is | M8/M9; historical notes retained |
| docs/DEPLOYMENT-RUNBOOK.md:125 | start with them and `DATA_DRIVER=supabase`. | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:7 | \| A-001 \| security \| Staff identity \| Staff sign in with the app's own staff auth: scrypt password hashes (the customer `password.ts`), hashed opaque session tokens in an `httpOnly` cookie (`sd_staff`, path `/`, `SameSite=Strict`), and mandatory TOTP (RFC 6238 | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:12 | \| A-006 \| security \| Three layers \| (1) `proxy.ts` redirects `/admin/**` without a staff cookie to `/admin/login`; (2) `requireStaff()` / `requirePermission()` (`server/admin/dal.ts`, `server-only`) open every admin page, route handler and server function; a t | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:17 | \| A-011 \| security \| Demo staff \| `ADMIN_DEMO_STAFF=on` seeds one **DEMO** staff member per preset role into the fixtures driver (`<role>@demo.soledrop.local`, password `Demo-Staff-2026!`, TOTP secret derived from the role key, `server/fixtures/admin-seed.ts`) | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:19 | \| A-013 \| derived \| Owner bootstrap \| The first Owner comes from `pnpm admin:create-owner --email you@…` (`scripts/create-owner.mjs`), which writes a one-time Owner invite into the **local** Supabase database (it refuses any non-local `SUPABASE_URL`) and print | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:20 | \| A-014 \| security \| Media uploads \| Images are accepted by their bytes (JPEG/PNG/WebP/AVIF magic numbers), at most 10 MB and 40 megapixels, then decoded and re-encoded with sharp to WebP (≤ 2400 px, metadata dropped); anything sharp can't decode is refused. F | M8/M9; historical notes retained |
| docs/app/admin/admin-decisions.md:27 | \| A-021 \| derived \| Saved local store \| Normal local work defaults to a saved single-process file driver, reusing the domain repository operations behind a serialized queue. Snapshots are checksummed and atomically replaced; private media lives beside them. Fi | M8/M9; historical notes retained |
| docs/app/admin/audit-events.md:21 | Who can read it: `audit:read` (Owner, Admin) through the admin, and through RLS (`audit_read` policy, `has_permission(store_id, 'audit:read')`). | M8/M9; historical notes retained |
| docs/app/admin/catalogue-and-banners.md:3 | The normal local store uses `DATA_DRIVER=local`. Catalogue, content, commerce and staff records are saved under `LOCAL_DATA_DIR` (default `.data/store`). Restarting never restores sample products or replaces admin edits. Explicit `DATA_DRIVER=fixtures` remains | M8/M9; historical notes retained |
| docs/app/admin/catalogue-and-banners.md:28 | The source of truth is now the saved store. Product/merchandising files moved out of `public` into `qa/fixtures/images` for isolated regressions. `supabase/seed.sql` now creates only operating configuration: an empty store, retail price list, PKR identity rate | M8/M9; historical notes retained |
| docs/app/admin/catalogue-and-banners.md:40 | - This local file driver supports one server process on one machine. Do not share it between replicas or put it on an ephemeral serverless filesystem. Hosted deployments use the existing Supabase path, the forward migrations and a private `media` Storage bucke | M8/M9; historical notes retained |
| docs/app/admin/security.md:12 | \| A logged-in member doing more than their role \| `adminRoute(access)` on every handler (architecture test), `permissionPage()` on every page, service-level permission checks on every operation, RLS `has_permission()` as the database backstop (A-006) \| `e2e/ad | M8/M9; historical notes retained |
| docs/app/admin/security.md:27 | - Staff identity is in-house, not Supabase Auth (A-001); RLS policies are written for Supabase-Auth users, so with in-house sessions the database layer protects against the anon key and customer tokens, while staff checks happen in layers 1–2. | M8/M9; historical notes retained |
| docs/app/admin/security.md:28 | - The fixtures driver keeps sessions and media in process memory: a restart signs everyone out and drops uploads. Production uses the Supabase driver. | M8/M9; historical notes retained |
| docs/app/admin/verification.md:7 | - Typecheck and zero-warning lint passed. All **200 tests in 25 files** passed, including migration metadata recovery, saved uploads, publishing, deletion, failed-write rollback, locking/corruption handling and the homepage SQL/RLS checks. | M8/M9; historical notes retained |
| docs/app/admin/verification.md:46 | - Database tests apply migrations and check RPCs/RLS in PGlite. Real Postgres parallel-connection contention, hosted Supabase and Storage integration remain unverified. | M8/M9; historical notes retained |
| docs/app/api.md:21 | `server/db/supabase.ts` maps them to the same codes. | M8/M9; historical notes retained |
| docs/app/build-log.md:11 | - Did not start application code. The session also had no shell (no pnpm, next build, tests, Playwright, Supabase CLI or git), so no stage could reach "Done when:" or be verified/committed. Writing unverified code would break the "never mark green without runn | M8/M9; historical notes retained |
| docs/app/build-log.md:23 | - Data seam: `server/<domain>` with fixtures and Supabase repositories selected by `DATA_DRIVER`. | M8/M9; historical notes retained |
| docs/app/build-log.md:24 | - Database: `supabase/migrations` (42 tables, RLS deny by default, SECURITY DEFINER staff-role pair with `search_path=''`, all RPCs), and `supabase/seed.sql` generated from the fixtures. | M8/M9; historical notes retained |
| docs/app/build-log.md:31 | - Hand-off: `.env.example` (checked by a test), Dockerfile, `.dockerignore`, `supabase/config.toml`, `docs/DEPLOYMENT-RUNBOOK.md`, `docs/app/{phase-2,data-model,api,caching,events}.md`. | M8/M9; historical notes retained |
| docs/app/build-log.md:34 | - vitest 70/70 ✓: RPC/contention 26, RLS 8, seed 2, unit/architecture/integration 34. | M8/M9; historical notes retained |
| docs/app/build-log.md:42 | - No Docker, Supabase CLI or Postgres server, so `supabase start`/`db reset` and parallel-connection lock tests can't run. PGlite serialises calls. | M8/M9; historical notes retained |
| docs/app/build-log.md:47 | - Migration `20261107090000_admin_foundation.sql` (additive): staff identity columns, `permissions`, `roles`, `role_permissions`, `staff_roles`, `staff_invites`, `staff_sessions`, audit context columns, `has_permission()` (SECURITY DEFINER, `search_path=''`),  | M8/M9; historical notes retained |
| docs/app/build-log.md:51 | - Tooling: `pnpm admin:docs` (generates `docs/app/admin/permissions.md`), `pnpm admin:create-owner` (local Supabase only), `.env.example` now committed (it was gitignored), DEMO staff for QA (`ADMIN_DEMO_STAFF=on` in `qa/serve.mjs`). | M8/M9; historical notes retained |
| docs/app/build-log.md:60 | - `server/orders`: staff search (number, email, name, phone; status, payment, method, date range; four sorts; paging), refunds list, return approve/reject, staff notes. Both drivers, plus migration `20261108090000_admin_orders.sql` (`order_notes` with RLS, sea | M8/M9; historical notes retained |
| docs/app/build-log.md:64 | Verified: tsc ✓, eslint ✓, vitest (admin orders integration 6, admin DB 9 incl. order notes RLS) ✓, `next build` ✓, Playwright Chromium admin-auth 9/9 + admin-orders 3/3 ✓. | M8/M9; historical notes retained |
| docs/app/build-log.md:68 | - Catalogue repository (both drivers): staff search over every status, by-id reads, `saveProduct` (migration `20261109090000_admin_catalog.sql`: `save_product` RPC with millisecond optimistic concurrency, slug/SKU uniqueness, ordered sizes protected), delete f | M8/M9; historical notes retained |
| docs/app/build-log.md:71 | - CSV export now neutralises formula cells for every export (done in A2) and staff search terms are sanitised in one place (`server/db/supabase.ts#searchTerm`). | M8/M9; historical notes retained |
| docs/app/build-log.md:126 | - The cross-browser attempt exposed BUG-021 (Zod's dynamic-code probe violates the nonce CSP in Firefox) and BUG-022 (checkout holds surviving bag changes, plus Supabase release deleting rows without restoring reserved counts). The red attempt was interrupted  | M8/M9; historical notes retained |
| docs/app/build-log.md:128 | - Cart line/quantity changes release prior holds. Supabase uses the existing `reserve_stock` RPC with an empty replacement; integration and PGlite tests cover stock restoration, repeated release, and isolation from another cart's holds. | M8/M9; historical notes retained |
| docs/app/build-log.md:146 | Implementation: local commit `8777e34` (QA fixes and component gallery). Resolved BUG-018–BUG-023: sale-savings contrast, the New Arrival keyboard regression, sort naming during hydration, Zod/CSP compatibility, checkout reservation release (including Supabase | M8/M9; historical notes retained |
| docs/app/build-log.md:158 | Remaining requirements (not claimed complete): PERF-03 (final admin initial JS 338.5–343.2 KiB vs 250 KiB), prior storefront performance/design findings, source design gate G3, broad export step-up coverage, exhaustive mutation/role and failure-atomicity check | M8/M9; historical notes retained |
| docs/app/build-log.md:162 | Completed the admin bootstrap/operations runbook, Admin API reference, current data model/RLS matrix and reservation semantics, cache invalidation notes, component capabilities, navigation registry description and security/verification limits. Corrected stale  | M8/M9; historical notes retained |
| docs/app/build-log.md:170 | Normal local operation now uses a single-process saved file driver with a shared queue, checksummed snapshots, atomic replacement, write rollback and an exclusive process lock. Media files persist beside it. Restarts never reseed products. Fixtures, sample ima | M8/M9; historical notes retained |
| docs/app/build-plan.md:10 | Scope: migration (staff auth columns, roles, permissions, role_permissions, staff_roles, staff_invites, staff_sessions, has_permission(), last-Owner trigger, RLS), fixtures tables; permission registry + preset roles; staff auth (password, TOTP MFA + recovery c | M8/M9; historical notes retained |
| docs/app/build-plan.md:29 | ### A13 — Documentation (runbook admin bootstrap, data-model RLS matrix, api.md) | M8/M9; historical notes retained |
| docs/app/build-plan.md:30 | Scope: complete the admin runbook, API/RLS documentation, component gallery and implementation notes. | M8/M9; historical notes retained |
| docs/app/caching.md:35 | - No application-level cache sits in front of the database. `DATA_DRIVER=local` reads the saved local store through a serialized repository queue; `fixtures` is in-process QA data; `supabase` queries Postgres through the server's service role. | M8/M9; historical notes retained |
| docs/app/data-model.md:3 | Source of truth: `supabase/migrations/` (schema → RLS → functions, forward only), mirrored by the | M8/M9; historical notes retained |
| docs/app/data-model.md:5 | (`tests/db`). 53 tables, all in `public`, all with RLS enabled and denied by default. The saved local driver mirrors domain rows in a versioned file snapshot; see [catalogue and banners](admin/catalogue-and-banners.md). | M8/M9; historical notes retained |
| docs/app/data-model.md:20 | \| Store & staff \| `stores`, `staff_members` \| Legacy `staff_role` enum: owner, manager, fulfilment, support; phase 2 staff use their own password/MFA sessions and RBAC roles (A-001, A-007). Supabase-Auth identities can use `auth.uid()` policies. `stores.next_o | M8/M9; historical notes retained |
| docs/app/data-model.md:66 | \| `has_permission(store, permission)` \| SECURITY DEFINER: does the signed-in user hold the permission through an active membership's roles. Used by the admin RLS policies. \| | M8/M9; historical notes retained |
| docs/app/data-model.md:75 | Cart line/quantity edits release the previous checkout holds after saving. The Supabase release path | M8/M9; historical notes retained |
| docs/app/data-model.md:91 | - **service_role** (the server) bypasses RLS. The key never leaves the server. | M8/M9; historical notes retained |
| docs/app/data-model.md:103 | Verified by `tests/db/rls.test.ts`. | M8/M9; historical notes retained |
| docs/app/design-decisions.md:66 | \| D-060 \| owner \| Delivery settings, promo bar, FAQ, bag, product page, Shipping policy \| Free delivery now starts at Rs. 12,000 (was PKR 5,000). The threshold lives in one place, the standard delivery rate's `freeOver` (`server/fixtures/commerce-seed.ts`, `su | M8/M9; historical notes retained |
| docs/app/phase-2.md:3 | Phase 1 delivered the storefront, the commerce engine, the database layer (migrations, RLS, functions, | M8/M9; historical notes retained |
| docs/app/phase-2.md:12 | \| P2-02 \| **Supabase project** region and plan \| Pro plan (point-in-time recovery) in the region closest to the app. Run `supabase db push` from a trusted machine (runbook §3). \| | M8/M9; historical notes retained |
| docs/app/phase-2.md:36 | \| P2-15 \| Staff identity in-house (A-001) or Supabase Auth \| Keep in-house until there's a reason (SSO, one login for several apps); the switch is contained in `server/admin`. \| | M8/M9; historical notes retained |
| docs/app/phase-2.md:51 | 7. **Parallel-connection concurrency test** against a real Postgres (the PGlite tests serialise calls; | M8/M9; historical notes retained |
| e2e/security.spec.ts:61 | expect(JSON.stringify(body)).not.toMatch(/stack\|at .*\.js\|supabase\|postgres/i) | M2/M5/M10 |
| features/admin/content/home-schema.ts:6 | // records for saved local and Supabase stores, including same-store ownership. | M1/M2/M6/M8 |
| lib/env.server.ts:14 | DATA_DRIVER: z.enum(["local", "fixtures", "supabase"]).default("local"), | M1/M2/M6/M8 |
| lib/env.server.ts:19 | // The seeded store (server/fixtures/seed.ts, supabase/seed.sql); one store per deployment. | M1/M2/M6/M8 |
| lib/env.server.ts:50 | if (env.DATA_DRIVER === "supabase" && (!env.SUPABASE_URL \|\| !env.SUPABASE_SERVICE_ROLE_KEY)) { | M1/M2/M6/M8 |
| lib/env.server.ts:51 | context.addIssue({ code: "custom", message: "DATA_DRIVER=supabase needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY" }) | M1/M2/M6/M8 |
| package.json:27 | "@supabase/ssr": "^0.12.7", | M1/M2/M6/M8 |
| package.json:28 | "@supabase/supabase-js": "^2.118.0", | M1/M2/M6/M8 |
| package.json:46 | "@electric-sql/pglite": "^0.5.14", | M1/M2/M6/M8 |
| pnpm-lock.yaml:14 | '@supabase/ssr': | M1/M2/M6/M8 |
| pnpm-lock.yaml:16 | version: 0.12.7(@supabase/supabase-js@2.118.0) | M1/M2/M6/M8 |
| pnpm-lock.yaml:17 | '@supabase/supabase-js': | M1/M2/M6/M8 |
| pnpm-lock.yaml:66 | '@electric-sql/pglite': | M1/M2/M6/M8 |
| pnpm-lock.yaml:296 | '@electric-sql/pglite@0.5.14': | M1/M2/M6/M8 |
| pnpm-lock.yaml:758 | '@supabase/auth-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:762 | '@supabase/functions-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:766 | '@supabase/phoenix@0.4.5': | M1/M2/M6/M8 |
| pnpm-lock.yaml:769 | '@supabase/postgrest-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:773 | '@supabase/realtime-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:777 | '@supabase/ssr@0.12.7': | M1/M2/M6/M8 |
| pnpm-lock.yaml:780 | '@supabase/supabase-js': ^2.114.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:782 | '@supabase/storage-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:786 | '@supabase/supabase-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3528 | '@electric-sql/pglite@0.5.14': {} | M1/M2/M6/M8 |
| pnpm-lock.yaml:3887 | '@supabase/auth-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3891 | '@supabase/functions-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3895 | '@supabase/phoenix@0.4.5': {} | M1/M2/M6/M8 |
| pnpm-lock.yaml:3897 | '@supabase/postgrest-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3901 | '@supabase/realtime-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3903 | '@supabase/phoenix': 0.4.5 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3906 | '@supabase/ssr@0.12.7(@supabase/supabase-js@2.118.0)': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3908 | '@supabase/supabase-js': 2.118.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3911 | '@supabase/storage-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3916 | '@supabase/supabase-js@2.118.0': | M1/M2/M6/M8 |
| pnpm-lock.yaml:3918 | '@supabase/auth-js': 2.118.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3919 | '@supabase/functions-js': 2.118.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3920 | '@supabase/postgrest-js': 2.118.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3921 | '@supabase/realtime-js': 2.118.0 | M1/M2/M6/M8 |
| pnpm-lock.yaml:3922 | '@supabase/storage-js': 2.118.0 | M1/M2/M6/M8 |
| proxy.ts:8 | * server/admin/dal.ts on every page and handler, and RLS backs them in the database. | M1/M2/M6/M8 |
| qa/bugs.md:41 | \| BUG-022 \| major (inventory) \| Bag edits / checkout reservation release \| Hold a pair at checkout, then remove it or reduce the quantity in the bag \| Previous holds are released and stock is available to other shoppers \| Holds survive cart edits; Supabase's r | M1/M2/M6/M8 |
| qa/bugs.md:66 | \| BUG-030 \| Local saved storage was labelled as Supabase in integration settings. \| Explicit local label, checked on the running saved preview. \| | M1/M2/M6/M8 |
| scripts/create-owner.mjs:3 | * Creates a one-time Owner invite in a saved local store or LOCAL Supabase and prints its link. | M1/M2/M6/M8 |
| scripts/create-owner.mjs:8 | * For Supabase, reads its URL and service-role key from the environment (or .env.local). Refuses any | M1/M2/M6/M8 |
| scripts/create-owner.mjs:48 | console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY (local Supabase). With the fixtures driver, use ADMIN_DEMO_STAFF=on instead.") | M1/M2/M6/M8 |
| scripts/serve.mjs:17 | env: { ...process.env, NODE_ENV: "production", PORT: process.argv[2] ?? process.env.PORT ?? "3200", HOSTNAME: process.env.DATA_DRIVER === "supabase" ? process.env.HOSTNAME ?? "0.0.0.0" : "127.0.0.1", LOCAL_DATA_DIR: path.resolve(process.env.LOCAL_DATA_DIR ?? " | M1/M2/M6/M8 |
| server/admin/dal.ts:17 | * before touching data; proxy.ts only does an optimistic cookie check, and RLS is the backstop. | M1/M2/M6/M8 |
| server/admin/index.ts:6 | import { createSupabaseAdminRepository } from "@/server/admin/supabase.repository" | M1/M2/M6/M8 |
| server/admin/index.ts:10 | const repository = selectRepository({ fixtures: createFixturesAdminRepository, supabase: createSupabaseAdminRepository }) | M1/M2/M6/M8 |
| server/admin/repository.ts:4 | /** Staff identity and RBAC storage; both drivers implement it (fixtures, supabase). */ | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:6 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:9 | /** Staff identity and RBAC on Postgres (migration 20261107090000_admin_foundation.sql). */ | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:163 | const row = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).ilike("email", email).maybeSingle()) as MemberRow \| null | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:167 | const row = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).eq("user_id", userId).maybeSingle()) as MemberRow \| null | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:171 | const rows = unwrap(await supabase().from("staff_members").select(MEMBER_COLUMNS).eq("store_id", storeId).order("created_at")) as MemberRow[] | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:176 | await supabase() | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:185 | let query = supabase().from("staff_members").update(memberColumns(changes)).eq("store_id", storeId).eq("user_id", userId) | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:194 | await supabase().rpc("sync_admin_registry", { | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:202 | const rows = unwrap(await supabase().from("roles").select(ROLE_COLUMNS).eq("store_id", storeId).order("created_at")) as RoleRow[] | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:206 | const row = unwrap(await supabase().from("roles").select(ROLE_COLUMNS).eq("store_id", storeId).eq("key", key).maybeSingle()) as RoleRow \| null | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:211 | await supabase().rpc("save_role", { | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:228 | await supabase().rpc("save_role", { | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:242 | unwrap(await supabase().rpc("delete_role", { p_store_id: storeId, p_key: key })) | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:246 | const rows = unwrap(await supabase().from("staff_roles").select(`roles(${ROLE_COLUMNS})`).eq("store_id", storeId).eq("user_id", userId)) as unknown as { roles: RoleRow }[] | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:250 | unwrap(await supabase().rpc("set_staff_roles", { p_store_id: storeId, p_user_id: userId, p_role_keys: roleKeys })) | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:253 | return unwrap(await supabase().rpc("active_owner_count", { p_store_id: storeId })) as number | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:258 | await supabase() | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:276 | const row = unwrap(await supabase().from("staff_invites").select("*").eq("token_hash", tokenHash).maybeSingle()) as InviteRow \| null | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:285 | unwrap(await supabase().from("staff_invites").update(map).eq("id", id)) | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:288 | const rows = unwrap(await supabase().from("staff_invites").select("*").eq("store_id", storeId).order("created_at", { ascending: false })) as InviteRow[] | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:294 | await supabase().from("staff_sessions").insert({ | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:310 | const row = unwrap(await supabase().from("staff_sessions").select("*").eq("token_hash", tokenHash).maybeSingle()) as SessionRow \| null | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:314 | unwrap(await supabase().from("staff_sessions").update(sessionColumns(changes)).eq("id", id)) | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:317 | const rows = unwrap(await supabase().from("staff_sessions").select("*").eq("store_id", storeId).eq("user_id", userId).order("last_seen_at", { ascending: false })) as SessionRow[] | M1/M2/M6/M8 |
| server/admin/supabase.repository.ts:321 | let query = supabase().from("staff_sessions").update({ revoked_at: new Date().toISOString() }).eq("store_id", storeId).eq("user_id", userId).is("revoked_at", null) | M1/M2/M6/M8 |
| server/cart/index.ts:5 | import { createSupabaseCartRepository } from "@/server/cart/supabase.repository" | M1/M2/M6/M8 |
| server/cart/index.ts:14 | const repository = selectRepository({ fixtures: createFixturesCartRepository, supabase: createSupabaseCartRepository }) | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:5 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:43 | await supabase().from("carts").select(CART_SELECT).eq("store_id", storeId).eq("token_hash", tokenHash).eq("status", "active").maybeSingle(), | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:48 | const row = unwrap(await supabase().from("carts").select(CART_SELECT).eq("id", id).maybeSingle()) as CartRecord \| null | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:53 | await supabase() | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:67 | await supabase().from("carts").insert({ | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:81 | await supabase().rpc("save_cart", { | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:91 | unwrap(await supabase().rpc("merge_carts", { p_guest_cart_id: guestCartId, p_customer_cart_id: customerCartId })) | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:95 | return unwrap(await supabase().rpc("purge_abandoned_carts", { p_older_than_days: olderThanDays })) as number | M1/M2/M6/M8 |
| server/cart/supabase.repository.ts:100 | const result = await supabase() | M1/M2/M6/M8 |
| server/catalog/index.ts:8 | import { createSupabaseCatalogRepository } from "@/server/catalog/supabase.repository" | M1/M2/M6/M8 |
| server/catalog/index.ts:17 | supabase: createSupabaseCatalogRepository, | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:5 | import { searchTerm, supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:81 | await supabase().from("products").select(PRODUCT_SELECT).eq("store_id", storeId).eq("status", "active").order("position"), | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:87 | await supabase().from("products").select(PRODUCT_SELECT).eq("store_id", storeId).eq("slug", slug).eq("status", "active").maybeSingle(), | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:93 | const productIds = unwrap(await supabase().from("variants").select("product_id").in("id", variantIds)) as { product_id: string }[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:95 | const rows = unwrap(await supabase().from("products").select(PRODUCT_SELECT).in("id", ids)) as unknown as ProductRecord[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:100 | await supabase() | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:109 | return unwrap(await supabase().from("brands").select("id, slug, name, position").eq("store_id", storeId).order("position")) as Brand[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:113 | await supabase().from("attribute_definitions").select("code, label, type, scope, options, filterable, position").eq("store_id", storeId).order("position"), | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:118 | await supabase().from("custom_field_definitions").select("entity, code, label, type, required, visible_on_storefront").eq("store_id", storeId), | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:124 | await supabase().rpc("import_products", { p_store_id: storeId, p_products: products }), | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:130 | let request = supabase().from("products").select(PRODUCT_SELECT, { count: "exact" }).eq("store_id", storeId) | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:142 | const row = unwrap(await supabase().from("products").select(PRODUCT_SELECT).eq("store_id", storeId).eq("id", id).maybeSingle()) as unknown as ProductRecord \| null | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:146 | unwrap(await supabase().rpc("save_product", { p_store_id: storeId, p_product: product, p_expected_updated_at: expectedUpdatedAt })) | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:152 | const variants = unwrap(await supabase().from("variants").select("id").eq("product_id", id)) as { id: string }[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:154 | const ordered = unwrap(await supabase().from("order_lines").select("id").in("variant_id", variants.map((variant) => variant.id)).limit(1)) as { id: string }[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:157 | const deleted = unwrap(await supabase().from("products").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:161 | unwrap(await supabase().rpc("save_collection", { p_store_id: storeId, p_collection: collection, p_product_ids: productIds })) | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:165 | unwrap(await supabase().from("collections").delete().eq("store_id", storeId).eq("id", id)) | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:168 | const rows = unwrap(await supabase().from("collection_products").select("product_id").eq("collection_id", collectionId).order("position")) as { product_id: string }[] | M1/M2/M6/M8 |
| server/catalog/supabase.repository.ts:172 | unwrap(await supabase().from("brands").insert({ id: brand.id, store_id: storeId, slug: brand.slug, name: brand.name, position: brand.position })) | M1/M2/M6/M8 |
| server/content/index.ts:9 | import { createSupabaseContentRepository } from "@/server/content/supabase.repository" | M1/M2/M6/M8 |
| server/content/index.ts:16 | supabase: createSupabaseContentRepository, | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:5 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:15 | const row = unwrap(await supabase().from("storefront_content").select("content, updated_at").eq("store_id", storeId).maybeSingle()) as { content: HomeContent; updated_at: string } \| null | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:19 | unwrap(await supabase().rpc("save_home", { p_store_id: storeId, p_content: content, p_expected_updated_at: expectedUpdatedAt })) | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:25 | const rows = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("published", true)) as PageRecord[] | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:29 | const row = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("slug", slug).eq("published", true).maybeSingle()) as PageRecord \| null | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:33 | return unwrap(await supabase().from("faqs").select("id, category, question, answer, position").eq("store_id", storeId).order("position")) as Faq[] | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:37 | await supabase().rpc("subscribe_newsletter", { p_store_id: storeId, p_email: subscriber.email, p_source: subscriber.source }), | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:41 | unwrap(await supabase().from("newsletter_subscribers").update({ status: "unsubscribed" }).eq("store_id", storeId).eq("email", email)) | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:45 | await supabase().from("contact_messages").insert({ | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:57 | const rows = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).order("title")) as PageRecord[] | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:61 | const row = unwrap(await supabase().from("pages").select("*").eq("store_id", storeId).eq("slug", slug).maybeSingle()) as PageRecord \| null | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:66 | await supabase().rpc("save_page", { | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:78 | const rows = unwrap(await supabase().from("pages").delete().eq("store_id", storeId).eq("slug", slug).select("slug")) as { slug: string }[] | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:82 | unwrap(await supabase().from("faqs").upsert({ id: faq.id, store_id: storeId, category: faq.category, question: faq.question, answer: faq.answer, position: faq.position }, { onConflict: "id" })) | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:86 | const rows = unwrap(await supabase().from("faqs").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:90 | unwrap(await supabase().rpc("reorder_faqs", { p_store_id: storeId, p_ids: ids })) | M1/M2/M6/M8 |
| server/content/supabase.repository.ts:93 | let request = supabase().from("newsletter_subscribers").select("email, status, source, consent_at", { count: "exact" }).eq("store_id", storeId) | M1/M2/M6/M8 |
| server/customers/index.ts:7 | import { createSupabaseCustomerRepository } from "@/server/customers/supabase.repository" | M1/M2/M6/M8 |
| server/customers/index.ts:12 | const repository = selectRepository({ fixtures: createFixturesCustomerRepository, supabase: createSupabaseCustomerRepository }) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:5 | import { searchTerm, supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:64 | let query = supabase().from("customers").select("*").eq(column, value) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:75 | await supabase() | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:94 | await supabase() | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:113 | unwrap(await supabase().from("sessions").insert({ token_hash: session.tokenHash, customer_id: session.customerId, expires_at: session.expiresAt })) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:117 | await supabase().from("sessions").select("token_hash, customer_id, created_at, expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle(), | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:122 | unwrap(await supabase().from("sessions").delete().eq("token_hash", tokenHash)) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:125 | unwrap(await supabase().from("sessions").delete().eq("customer_id", customerId)) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:129 | unwrap(await supabase().from("password_resets").insert({ token_hash: reset.tokenHash, customer_id: reset.customerId, expires_at: reset.expiresAt })) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:133 | await supabase() | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:146 | const rows = unwrap(await supabase().from("addresses").select("*").eq("customer_id", customerId).order("is_default", { ascending: false })) as AddressRecord[] | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:151 | await supabase().rpc("save_address", { | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:170 | unwrap(await supabase().rpc("delete_address", { p_customer_id: customerId, p_address_id: addressId })) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:173 | unwrap(await supabase().rpc("scrub_customer", { p_customer_id: customerId })) | M1/M2/M6/M8 |
| server/customers/supabase.repository.ts:176 | let request = supabase().from("customers").select("*", { count: "exact" }).eq("store_id", storeId).not("email", "like", "%@invalid") | M1/M2/M6/M8 |
| server/db/driver.ts:6 | export type DataDriver = "local" \| "fixtures" \| "supabase" | M1/M2/M6/M8 |
| server/db/driver.ts:30 | export function selectRepository<T extends object>(implementations: { fixtures: () => T; supabase: () => T }): () => T { | M1/M2/M6/M8 |
| server/db/local-store.ts:7 | /** Durable, single-process local storage. Hosted deployments use the Supabase driver. */ | M1/M2/M6/M8 |
| server/db/supabase.ts:3 | import { createClient, type SupabaseClient } from "@supabase/supabase-js" | M1/M2/M6/M8 |
| server/db/supabase.ts:11 | * Service-role client for the supabase driver. Server-only: the key bypasses RLS, so it is | M1/M2/M6/M8 |
| server/db/supabase.ts:12 | * read from lib/env.server.ts and never reaches the browser. RLS still protects every table | M1/M2/M6/M8 |
| server/db/supabase.ts:13 | * from the anon and authenticated roles (supabase/migrations). | M1/M2/M6/M8 |
| server/db/supabase.ts:15 | export function supabase(): SupabaseClient { | M1/M2/M6/M8 |
| server/db/supabase.ts:26 | /** Codes our RPCs raise as "code: shopper-safe message" (supabase/migrations/*_functions.sql). */ | M1/M2/M6/M8 |
| server/db/supabase.ts:29 | /** Unwraps a supabase-js response, translating Postgres errors raised by our RPCs into DomainErrors. */ | M1/M2/M6/M8 |
| server/fixtures/seed.ts:20 | * The same data seeds Postgres via `node scripts/db-seed-sql.mjs`. | M1/M2/M6/M8 |
| server/fixtures/store.ts:24 | * The in-memory database behind DATA_DRIVER=fixtures. Tables mirror the Postgres schema | M1/M2/M6/M8 |
| server/fixtures/store.ts:25 | * (supabase/migrations) and the fixtures repositories reproduce each RPC's guarantees — | M1/M2/M6/M8 |
| server/fixtures/store.ts:186 | * fixtures driver mirrors a Postgres transaction. Node runs it without interleaving because | M1/M2/M6/M8 |
| server/fixtures/tables.ts:20 | /** Shape of the fixtures database — one property per Postgres table (docs/app/data-model.md). */ | M1/M2/M6/M8 |
| server/http/jobs.ts:11 | * any scheduler (cron, Supabase pg_cron + pg_net, a platform cron) can drive them. | M1/M2/M6/M8 |
| server/inventory/index.ts:5 | import { createSupabaseInventoryRepository } from "@/server/inventory/supabase.repository" | M1/M2/M6/M8 |
| server/inventory/index.ts:8 | export const inventory = selectRepository({ fixtures: createFixturesInventoryRepository, supabase: createSupabaseInventoryRepository }) | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:3 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:11 | await supabase().rpc("stock_availability", { p_variant_ids: variantIds, p_cart_id: forCartId ?? null }), | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:17 | await supabase().rpc("reserve_stock", { | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:26 | unwrap(await supabase().rpc("reserve_stock", { p_cart_id: cartId, p_items: [], p_ttl_minutes: 15 })) | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:30 | const rows = unwrap(await supabase().from("inventory_levels").select("variant_id, on_hand").in("variant_id", variantIds)) as { variant_id: string; on_hand: number }[] | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:34 | return unwrap(await supabase().rpc("release_expired_reservations")) as number | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:38 | await supabase().rpc("adjust_stock", { p_variant_id: variantId, p_delta: delta, p_reason: reason, p_actor: actor }), | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:43 | const rows = unwrap(await supabase().from("inventory_levels").select("variant_id, on_hand, reserved").in("variant_id", variantIds)) as { variant_id: string; on_hand: number; reserved: number }[] | M1/M2/M6/M8 |
| server/inventory/supabase.repository.ts:48 | const rows = unwrap(await supabase().from("inventory_movements").select("id, variant_id, delta, reason, actor, at").in("variant_id", variantIds).order("at", { ascending: false }).limit(limit)) as { id: string; variant_id: string; delta: number; reason: string; | M1/M2/M6/M8 |
| server/media/index.ts:7 | import { createSupabaseMediaRepository } from "@/server/media/supabase.repository" | M1/M2/M6/M8 |
| server/media/index.ts:11 | const repository = selectRepository({ fixtures: createFixturesMediaRepository, supabase: createSupabaseMediaRepository }) | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:3 | import { searchTerm, supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:8 | /** Index rows in `media` (migration 20261109090000), files in the Supabase Storage bucket `media` (runbook). */ | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:30 | return unwrap(await supabase().rpc("media_has_order_usage", { p_store_id: storeId, p_url: url })) as boolean | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:33 | let request = supabase().from("media").select("*", { count: "exact" }).eq("store_id", storeId) | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:42 | const row = unwrap(await supabase().from("media").select("*").eq("store_id", storeId).eq("id", id).maybeSingle()) as MediaRecord \| null | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:46 | const row = unwrap(await supabase().from("media").select("*").eq("id", id).maybeSingle()) as MediaRecord \| null | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:50 | const upload = await supabase().storage.from(BUCKET).upload(item.path, data, { contentType: item.mime, upsert: false }) | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:53 | await supabase() | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:62 | const row = unwrap(await supabase().from("media").update({ alt }).eq("store_id", storeId).eq("id", id).select("*").maybeSingle()) as MediaRecord \| null | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:67 | const row = unwrap(await supabase().from("media").delete().eq("store_id", storeId).eq("id", id).select("path").maybeSingle()) as { path: string } \| null | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:69 | await supabase().storage.from(BUCKET).remove([row.path]) | M1/M2/M6/M8 |
| server/media/supabase.repository.ts:72 | const download = await supabase().storage.from(BUCKET).download(path) | M1/M2/M6/M8 |
| server/media/validate.ts:6 | import { createSupabaseMediaRepository } from "@/server/media/supabase.repository" | M1/M2/M6/M8 |
| server/media/validate.ts:9 | const repository = selectRepository({ fixtures: createFixturesMediaRepository, supabase: createSupabaseMediaRepository }) | M1/M2/M6/M8 |
| server/orders/fixtures.repository.ts:39 | /** Staff search over the fixture orders, mirroring the Postgres query in the supabase repository. */ | M1/M2/M6/M8 |
| server/orders/index.ts:12 | import { createSupabaseOrderRepository } from "@/server/orders/supabase.repository" | M1/M2/M6/M8 |
| server/orders/index.ts:14 | const repository = selectRepository({ fixtures: createFixturesOrderRepository, supabase: createSupabaseOrderRepository }) | M1/M2/M6/M8 |
| server/orders/state-machine.ts:4 | * Legal order transitions. The same table is enforced in Postgres by `transition_order` | M1/M2/M6/M8 |
| server/orders/state-machine.ts:5 | * (supabase/migrations) so no client — storefront, API or future admin — can skip a step. | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:3 | import { searchTerm, supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:172 | const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("id", id).maybeSingle()) as OrderRecord \| null | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:179 | await supabase().rpc("place_order", { | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:232 | const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("number", number).maybeSingle()) as OrderRecord \| null | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:237 | const row = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("idempotency_key", key).maybeSingle()) as OrderRecord \| null | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:242 | await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).eq("customer_id", customerId).order("placed_at", { ascending: false }), | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:247 | const rows = unwrap(await supabase().from("orders").select(ORDER_SELECT).eq("store_id", storeId).ilike("email", email)) as OrderRecord[] | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:251 | unwrap(await supabase().rpc("transition_order", { p_order_id: orderId, p_to: to, p_actor: actor, p_note: note ?? null, p_tracking_number: trackingNumber ?? null })) | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:256 | await supabase().rpc("record_payment", { | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:269 | const rows = unwrap(await supabase().from("payments").select("*").eq("order_id", orderId).order("created_at")) as PaymentRecord[] | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:274 | await supabase().rpc("create_refund", { | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:288 | await supabase().rpc("create_return", { | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:297 | const row = unwrap(await supabase().rpc("restock_return", { p_return_id: returnId, p_actor: actor })) as ReturnRecord | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:301 | const rows = unwrap(await supabase().from("returns").select("*").eq("order_id", orderId)) as ReturnRecord[] | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:305 | let request = supabase().from("orders").select(ORDER_SELECT, { count: "exact" }).eq("store_id", storeId) | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:320 | const rows = unwrap(await supabase().from("refunds").select("*").eq("order_id", orderId).order("created_at")) as RefundRecord[] | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:324 | const row = unwrap(await supabase().from("returns").update({ status: decision }).eq("id", returnId).eq("status", "requested").select("*").maybeSingle()) as ReturnRecord \| null | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:326 | const existing = unwrap(await supabase().from("returns").select("status").eq("id", returnId).maybeSingle()) as { status: string } \| null | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:331 | const row = unwrap(await supabase().from("order_notes").insert({ order_id: note.orderId, author: note.author, author_name: note.authorName, body: note.body }).select("*").single()) as NoteRecord | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:335 | const rows = unwrap(await supabase().from("order_notes").select("*").eq("order_id", orderId).order("created_at")) as NoteRecord[] | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:341 | let request = supabase().from("payments").select("id, provider, status, amount, currency, provider_ref, created_at, orders!inner(number, store_id)", { count: "exact" }).eq("orders.store_id", storeId) | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:347 | const result = await supabase().from("refunds").select("id, amount, reason, created_at, payments(provider), orders!inner(number, store_id, currency)", { count: "exact" }).eq("orders.store_id", storeId).order("created_at", { ascending: false }).range(start, sta | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:352 | return unwrap(await supabase().rpc("next_order_number", { p_store_id: storeId })) as string | M1/M2/M6/M8 |
| server/orders/supabase.repository.ts:355 | return unwrap(await supabase().rpc("anonymise_customer_orders", { p_customer_id: customerId })) as number | M1/M2/M6/M8 |
| server/platform/index.ts:5 | import { createSupabasePlatformRepository } from "@/server/platform/supabase.repository" | M1/M2/M6/M8 |
| server/platform/index.ts:7 | export const platform = selectRepository({ fixtures: createFixturesPlatformRepository, supabase: createSupabasePlatformRepository }) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:3 | import { searchTerm, supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:34 | await supabase().from("feature_flags").select("key, description, enabled, customer_groups").eq("store_id", storeId), | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:39 | const row = unwrap(await supabase().from("outbox_events").insert({ store_id: storeId, topic, payload }).select("*").single()) as OutboxRecord | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:43 | const rows = unwrap(await supabase().rpc("claim_outbox_events", { p_limit: limit })) as OutboxRecord[] | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:47 | unwrap(await supabase().from("outbox_events").update({ status: "delivered", delivered_at: new Date().toISOString() }).eq("id", id)) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:50 | unwrap(await supabase().rpc("fail_outbox_event", { p_id: id, p_error: error, p_max_attempts: maxAttempts })) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:54 | await supabase().from("webhook_deliveries").insert({ | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:65 | await supabase().from("audit_log").insert({ | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:83 | await supabase().from("audit_log").select("id, actor, action, entity, entity_id, before, after, at").eq("entity", entity).eq("entity_id", entityId).order("at"), | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:88 | return unwrap(await supabase().rpc("rate_limit_hit", { p_key: key, p_window_seconds: windowSeconds })) as number | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:92 | await supabase().from("idempotency_keys").select("status, body").eq("key", key).gt("expires_at", new Date().toISOString()).maybeSingle(), | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:97 | unwrap(await supabase().from("idempotency_keys").upsert({ key, status, body })) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:100 | const result = await supabase().from("stores").select("id").limit(1) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:105 | await supabase() | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:117 | let request = supabase().from("audit_log").select("*", { count: "exact" }).or(`store_id.eq.${storeId},store_id.is.null`) | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:134 | const count = async (status: string) => (await supabase().from("outbox_events").select("id", { count: "exact", head: true }).eq("store_id", storeId).eq("status", status)).count ?? 0 | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:136 | const failedRows = unwrap(await supabase().from("outbox_events").select("*").eq("store_id", storeId).eq("status", "failed").order("created_at", { ascending: false }).limit(20)) as { id: string; topic: OutboxEvent["topic"]; payload: Record<string, unknown>; sta | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:137 | const deliveryRows = unwrap(await supabase().from("webhook_deliveries").select("id, event_id, endpoint, status, response_status, at, outbox_events!inner(store_id)").eq("outbox_events.store_id", storeId).order("at", { ascending: false }).limit(20)) as unknown a | M1/M2/M6/M8 |
| server/platform/supabase.repository.ts:147 | const rows = unwrap(await supabase().from("outbox_events").update({ status: "pending", available_at: new Date().toISOString(), last_error: null }).eq("store_id", storeId).eq("id", id).eq("status", "failed").select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/pricing/index.ts:6 | import { createSupabasePricingRepository } from "@/server/pricing/supabase.repository" | M1/M2/M6/M8 |
| server/pricing/index.ts:8 | const repository = selectRepository({ fixtures: createFixturesPricingRepository, supabase: createSupabasePricingRepository }) | M1/M2/M6/M8 |
| server/pricing/supabase.repository.ts:3 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/pricing/supabase.repository.ts:11 | await supabase().from("price_lists").select("id, code, currency, customer_group, priority, starts_at, ends_at").eq("store_id", storeId), | M1/M2/M6/M8 |
| server/pricing/supabase.repository.ts:26 | await supabase().from("prices").select("price_list_id, variant_id, amount, compare_at").in("variant_id", variantIds), | M1/M2/M6/M8 |
| server/pricing/supabase.repository.ts:32 | await supabase().from("exchange_rates").select("base, rates, updated_at").eq("store_id", storeId).single(), | M1/M2/M6/M8 |
| server/pricing/supabase.repository.ts:38 | await supabase() | M1/M2/M6/M8 |
| server/promotions/index.ts:9 | import { createSupabasePromotionRepository } from "@/server/promotions/supabase.repository" | M1/M2/M6/M8 |
| server/promotions/index.ts:13 | supabase: createSupabasePromotionRepository, | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:3 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:43 | const rows = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).eq("active", true)) as PromotionRecord[] | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:48 | await supabase().rpc("promotion_redemption_counts", { p_store_id: storeId, p_customer_id: shopper.customerId, p_email: shopper.email }), | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:54 | await supabase().rpc("shopper_order_count", { p_store_id: storeId, p_customer_id: shopper.customerId, p_email: shopper.email }), | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:59 | const rows = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).order("title")) as PromotionRecord[] | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:63 | const row = unwrap(await supabase().from("promotions").select("*").eq("store_id", storeId).eq("id", id).maybeSingle()) as PromotionRecord \| null | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:69 | await supabase() | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:94 | const used = unwrap(await supabase().from("promotion_redemptions").select("id").eq("promotion_id", id).limit(1)) as { id: string }[] | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:96 | const deleted = unwrap(await supabase().from("promotions").delete().eq("store_id", storeId).eq("id", id).eq("times_used", 0).select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/promotions/supabase.repository.ts:100 | const rows = unwrap(await supabase().from("promotion_redemptions").select("promotion_id, order_id, email, at").eq("promotion_id", promotionId).order("at", { ascending: false }).limit(limit)) as { | M1/M2/M6/M8 |
| server/search/index.ts:6 | import { createSupabaseSearchRepository } from "@/server/search/supabase.repository" | M1/M2/M6/M8 |
| server/search/index.ts:8 | const repository = selectRepository({ fixtures: createFixturesSearchRepository, supabase: createSupabaseSearchRepository }) | M1/M2/M6/M8 |
| server/search/match.ts:4 | * Pure functions, so the fixtures and Supabase drivers rank results identically. | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:3 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:11 | return unwrap(await supabase().from("search_synonyms").select("id, term, synonyms").eq("store_id", storeId).order("term")) as SynonymGroup[] | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:15 | await supabase().from("search_queries").insert({ | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:28 | const rows = unwrap(await supabase().rpc("search_trending", { p_store_id: storeId, p_days: days, p_limit: limit })) as { query: string; count: number }[] | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:32 | const row = unwrap(await supabase().rpc("search_report", { p_store_id: storeId, p_days: days, p_limit: limit })) as { | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:42 | unwrap(await supabase().from("search_synonyms").upsert({ id: group.id, store_id: storeId, term: group.term, synonyms: group.synonyms }, { onConflict: "id" })) | M1/M2/M6/M8 |
| server/search/supabase.repository.ts:46 | const rows = unwrap(await supabase().from("search_synonyms").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/shipping/index.ts:8 | import { createSupabaseShippingRepository } from "@/server/shipping/supabase.repository" | M1/M2/M6/M8 |
| server/shipping/index.ts:12 | supabase: createSupabaseShippingRepository, | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:3 | import { supabase, unwrap } from "@/server/db/supabase" | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:12 | await supabase() | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:48 | await supabase().from("tax_rates").select("country, province, label, basis_points, inclusive").eq("store_id", storeId), | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:54 | await supabase().rpc("save_shipping_zone", { | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:63 | const deleted = unwrap(await supabase().from("shipping_zones").delete().eq("store_id", storeId).eq("id", id).select("id")) as { id: string }[] | M1/M2/M6/M8 |
| server/shipping/supabase.repository.ts:67 | unwrap(await supabase().rpc("replace_tax_rates", { p_store_id: storeId, p_rates: rates.map((rate) => ({ country: rate.country, province: rate.province, label: rate.label, basis_points: rate.basisPoints, inclusive: rate.inclusive })) })) | M1/M2/M6/M8 |
| supabase/config.toml:1 | # Local Supabase stack for development (`supabase start`, `supabase db reset`). | M1/M3/M5 |
| supabase/config.toml:2 | # Never `supabase link` or `supabase db push` from this repository without the owner (docs/DEPLOYMENT-RUNBOOK.md). | M1/M3/M5 |
| supabase/config.toml:9 | # gets no direct table access (RLS denies anon by default), so only these schemas are exposed. | M1/M3/M5 |
| supabase/config.toml:40 | # Shopper accounts live in public.customers (server/customers); Supabase Auth is reserved for staff (phase 2). | M1/M3/M5 |
| supabase/migrations/20261104090000_schema.sql:4 | -- gen_random_uuid() is core Postgres (13+); no extension needed. | M1/M3/M5 |
| supabase/migrations/20261104090000_schema.sql:34 | -- Staff are Supabase Auth users (phase 2 admin); shoppers use the app's own sessions table. | M1/M3/M5 |
| supabase/migrations/20261104090100_rls.sql:4 | -- and content; staff (Supabase Auth users listed in staff_members, phase 2 admin) act by role. | M1/M3/M5 |
| supabase/migrations/20261104090100_rls.sql:36 | -- ─── Enable RLS everywhere; start from no privileges ──────────────────────── | M1/M3/M5 |
| supabase/migrations/20261104090200_functions.sql:4 | -- Expected failures raise 'code: shopper-safe message'; server/db/supabase.ts maps the code to a DomainError. | M1/M3/M5 |
| supabase/migrations/20261105090000_search.sql:3 | -- drivers (identical ranking); Postgres supplies storage, trending aggregation and trigram indexes | M1/M3/M5 |
| supabase/migrations/20261105090000_search.sql:5 | -- Supabase installs extensions in the `extensions` schema; created here when missing (local, tests). | M1/M3/M5 |
| supabase/migrations/20261105090000_search.sql:8 | create extension if not exists pg_trgm with schema extensions; | M1/M3/M5 |
| supabase/migrations/20261107090000_admin_foundation.sql:4 | -- admin uses where a change must be atomic. RLS is enabled on every new table. | M1/M3/M5 |
| supabase/migrations/20261107090000_admin_foundation.sql:116 | -- ─── Permission check for RLS (A-006 layer 3) ─────────────────────────────── | M1/M3/M5 |
| supabase/migrations/20261107090000_admin_foundation.sql:297 | -- ─── RLS (A-006): deny by default; staff act through has_permission() ─────── | M1/M3/M5 |
| supabase/migrations/20261109090000_admin_catalog.sql:131 | -- Files live in object storage (Supabase Storage bucket `media`, runbook); this is the index. | M1/M3/M5 |
| tests/db/admin.test.ts:1 | import type { PGlite } from "@electric-sql/pglite" | M2/M5/M10 |
| tests/db/admin.test.ts:6 | /** Admin foundation (migration 20261107090000): RBAC, has_permission, last Owner, RPCs, RLS. */ | M2/M5/M10 |
| tests/db/admin.test.ts:215 | // RLS lets the statement run but match no rows: nothing changes. | M2/M5/M10 |
| tests/db/harness.ts:4 | import { PGlite } from "@electric-sql/pglite" | M2/M5/M10 |
| tests/db/harness.ts:5 | import { pg_trgm } from "@electric-sql/pglite/contrib/pg_trgm" | M2/M5/M10 |
| tests/db/harness.ts:7 | const MIGRATIONS = path.resolve(import.meta.dirname, "../../supabase/migrations") | M2/M5/M10 |
| tests/db/harness.ts:10 | * What Supabase provides before our migrations run: the API roles and `auth.uid()` reading the | M2/M5/M10 |
| tests/db/harness.ts:28 | /** A new in-memory Postgres with every migration applied in file-name order. */ | M2/M5/M10 |
| tests/db/harness.ts:30 | // Supabase ships pg_trgm; PGlite loads it as a contrib module (migration 20261105090000). | M2/M5/M10 |
| tests/db/harness.ts:31 | const db = new PGlite({ extensions: { pg_trgm } }) | M2/M5/M10 |
| tests/db/harness.ts:95 | /** The p_order payload the app sends (server/orders/supabase.repository.ts). */ | M2/M5/M10 |
| tests/db/home-content.test.ts:15 | await db.exec(fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/seed.sql"), "utf8")) | M2/M5/M10 |
| tests/db/rls.test.ts:1 | import type { PGlite } from "@electric-sql/pglite" | M2/M5/M10 |
| tests/db/rpc.test.ts:1 | import type { PGlite } from "@electric-sql/pglite" | M2/M5/M10 |
| tests/db/rpc.test.ts:9 | * invariants under interleaving; parallel-connection lock timing needs a Postgres server | M2/M5/M10 |
| tests/db/search.test.ts:1 | import type { PGlite } from "@electric-sql/pglite" | M2/M5/M10 |
| tests/unit/architecture.test.ts:33 | it("gives every repository a supabase and a fixtures implementation behind one index", () => { | M2/M5/M10 |
| tests/unit/architecture.test.ts:37 | for (const file of ["supabase.repository.ts", "fixtures.repository.ts", "index.ts"]) { | M2/M5/M10 |
| tests/unit/architecture.test.ts:59 | expect(readers.sort()).toEqual([path.join("lib", "env.server.ts"), path.join("server", "db", "supabase.ts")].sort()) | M2/M5/M10 |
| tests/unit/architecture.test.ts:96 | for (const file of [...source, ...files("supabase", /\.sql$/), ...files("tests", /\.ts$/)].filter((name) => !name.endsWith("architecture.test.ts"))) { | M2/M5/M10 |
| tests/unit/architecture.test.ts:102 | for (const file of files("supabase/migrations", /\.sql$/)) { | M2/M5/M10 |
| tests/unit/architecture.test.ts:108 | const names = files("supabase/migrations", /\.sql$/).map((file) => path.basename(file)) | M2/M5/M10 |
| tests/unit/orders.test.ts:13 | it("matches the transition table in transition_order (supabase/migrations)", () => { | M2/M5/M10 |
| tests/unit/orders.test.ts:14 | const sql = fs.readFileSync(path.resolve(import.meta.dirname, "../../supabase/migrations/20261104090200_functions.sql"), "utf8") | M2/M5/M10 |
| vitest.config.ts:17 | // PGlite boots a WASM Postgres per database suite. | M1/M2/M6/M8 |

## Legacy SQL test intent ledger

Every existing assertion is ported to real-engine checks or actor/grant checks before its legacy file is retired. Tests are not removed to obtain a pass.

| Existing test file | Equivalent target | Stages |
| --- | --- | --- |
| tests/db/admin.test.ts | db/tests/admin.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |
| tests/db/home-content.test.ts | db/tests/home-content.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |
| tests/db/rls.test.ts | db/tests/rls.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |
| tests/db/rpc.test.ts | db/tests/rpc.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |
| tests/db/search.test.ts | db/tests/search.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |
| tests/db/seed.test.ts | db/tests/seed.test.ts (shared MySQL/MariaDB case definitions; actor/grant equivalents for RLS/functions) | M1/M2/M3/M5/M10 |

The generated qa/fixtures/seed.sql and tests/db/seed-sql.ts are PostgreSQL-format seed generators even where no vendor word appears. Their content maps to db/seed and the portable demo/reset command at M1/M2, with a marked demo dataset and private saved-catalogue import kept separate.
