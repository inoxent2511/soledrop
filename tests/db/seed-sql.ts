import { commerceSeed } from "@/server/fixtures/commerce-seed"
import { contentSeed } from "@/server/fixtures/content-seed"
import { searchSeed } from "@/server/fixtures/search-seed"
import { attributeDefinitions, basePrices, brands, collections, customFieldDefinitions, openingStock, products, STORE_ID } from "@/server/fixtures/seed"

/** JSON literal safe inside SQL (dollar-quoted, so no escaping is needed). */
const json = (value: unknown) => `$seed$${JSON.stringify(value)}$seed$::jsonb`

/**
 * qa/fixtures/seed.sql, built from the same fixtures the isolated QA driver serves. It contains
 * the catalogue, prices, stock, shipping, promotions and
 * content the storefront was built and tested against. Products go through import_products,
 * the same RPC the import API uses.
 */
export function seedSql(): string {
  const store = STORE_ID
  return [
    "-- GENERATED from server/fixtures by tests/db/seed.test.ts (WRITE_SEED=1 to refresh) — do not edit.",
    "-- Isolated QA only. Never apply this sample catalogue to a merchant store.",
    "",
    `insert into public.stores (id, name, default_currency, order_prefix, next_order_number) values ('${store}', 'Sole Drop', 'PKR', 'SD', 10001);`,
    "",
    `insert into public.brands (id, store_id, slug, name, position)
  select id, '${store}', slug, name, position from jsonb_to_recordset(${json(brands)}) as r(id uuid, slug text, name text, position integer);`,
    "",
    `insert into public.attribute_definitions (store_id, code, label, type, scope, options, filterable, position)
  select '${store}', code, label, type, scope, options, filterable, position
  from jsonb_to_recordset(${json(attributeDefinitions)}) as r(code text, label text, type text, scope text, options jsonb, filterable boolean, position integer);`,
    "",
    `insert into public.custom_field_definitions (store_id, entity, code, label, type, required, visible_on_storefront)
  select '${store}', entity, code, label, type, required, "visibleOnStorefront"
  from jsonb_to_recordset(${json(customFieldDefinitions)}) as r(entity text, code text, label text, type text, required boolean, "visibleOnStorefront" boolean);`,
    "",
    `insert into public.collections (id, store_id, slug, title, headline, description, kind, rules, image, position, seo)
  select id, '${store}', slug, title, headline, coalesce(description, ''), kind, rules, image, position, coalesce(seo, '{}')
  from jsonb_to_recordset(${json(collections)}) as r(id uuid, slug text, title text, headline jsonb, description text, kind text, rules jsonb, image jsonb, position integer, seo jsonb);`,
    "",
    `select public.import_products('${store}', ${json(products)});`,
    "",
    `update public.inventory_levels as level set on_hand = r."onHand"
  from jsonb_to_recordset(${json(openingStock)}) as r("variantId" uuid, "onHand" integer)
  where level.variant_id = r."variantId";`,
    "",
    `insert into public.price_lists (id, store_id, code, currency, customer_group, priority, starts_at, ends_at)
  select id, '${store}', code, currency::public.currency_code, "customerGroup"::public.customer_group, priority, "startsAt", "endsAt"
  from jsonb_to_recordset(${json(commerceSeed.priceLists)}) as r(id uuid, code text, currency text, "customerGroup" text, priority integer, "startsAt" timestamptz, "endsAt" timestamptz);`,
    "",
    `insert into public.prices (price_list_id, variant_id, amount, compare_at)
  select "priceListId", "variantId", amount, "compareAt"
  from jsonb_to_recordset(${json([...basePrices.map((price) => ({ ...price, priceListId: commerceSeed.priceLists[0].id })), ...commerceSeed.extraPrices])})
    as r("priceListId" uuid, "variantId" uuid, amount bigint, "compareAt" bigint);`,
    "",
    `insert into public.exchange_rates (store_id, base, rates, updated_at)
  values ('${store}', '${commerceSeed.exchangeRates.base}', ${json(commerceSeed.exchangeRates.rates)}, '${commerceSeed.exchangeRates.updatedAt}');`,
    "",
    ...commerceSeed.shippingZones.flatMap((zone) => [
      `insert into public.shipping_zones (id, store_id, name, countries, cities, position)
  values ('${zone.id}', '${store}', ${json(zone.name)} #>> '{}', array(select jsonb_array_elements_text(${json(zone.countries)})), array(select jsonb_array_elements_text(${json(zone.cities)})), ${zone.position});`,
      `insert into public.shipping_rates (zone_id, code, label, amount, free_over, min_days, max_days, cash_on_delivery)
  select '${zone.id}', code, label, amount, "freeOver", "minDays", "maxDays", "cashOnDelivery"
  from jsonb_to_recordset(${json(zone.rates)}) as r(code text, label text, amount bigint, "freeOver" bigint, "minDays" integer, "maxDays" integer, "cashOnDelivery" boolean);`,
    ]),
    "",
    `insert into public.tax_rates (store_id, country, province, label, basis_points, inclusive)
  select '${store}', country, province, label, "basisPoints", inclusive
  from jsonb_to_recordset(${json(commerceSeed.taxRates)}) as r(country text, province text, label text, "basisPoints" integer, inclusive boolean);`,
    "",
    `insert into public.promotions (id, store_id, code, title, conditions, actions, starts_at, ends_at, usage_limit, per_customer_limit, times_used, active, combinable)
  select id, '${store}', code, title, conditions, actions, "startsAt", "endsAt", "usageLimit", "perCustomerLimit", "timesUsed", active, combinable
  from jsonb_to_recordset(${json(commerceSeed.promotions)})
    as r(id uuid, code text, title text, conditions jsonb, actions jsonb, "startsAt" timestamptz, "endsAt" timestamptz, "usageLimit" integer, "perCustomerLimit" integer, "timesUsed" integer, active boolean, combinable boolean);`,
    "",
    `insert into public.feature_flags (store_id, key, description, enabled, customer_groups)
  select '${store}', key, description, enabled, array(select jsonb_array_elements_text("customerGroups"))
  from jsonb_to_recordset(${json(commerceSeed.flags.map((flag) => ({ ...flag, customerGroups: flag.customerGroups ?? null })))})
    as r(key text, description text, enabled boolean, "customerGroups" jsonb);`,
    "",
    `insert into public.pages (store_id, slug, title, description, blocks, seo, published, updated_at)
  select '${store}', slug, title, description, blocks, coalesce(seo, '{}'), true, "updatedAt"
  from jsonb_to_recordset(${json(contentSeed.pages)}) as r(slug text, title text, description text, blocks jsonb, seo jsonb, "updatedAt" timestamptz);`,
    "",
    `insert into public.faqs (id, store_id, category, question, answer, position)
  select id, '${store}', category, question, answer, position
  from jsonb_to_recordset(${json(contentSeed.faqs)}) as r(id uuid, category text, question text, answer text, position integer);`,
    "",
    `insert into public.search_synonyms (id, store_id, term, synonyms)
  select id, '${store}', term, array(select jsonb_array_elements_text(synonyms))
  from jsonb_to_recordset(${json(searchSeed.synonyms)}) as r(id uuid, term text, synonyms jsonb);`,
    "",
  ].join("\n")
}
