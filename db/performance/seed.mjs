import fs from "node:fs/promises"
import path from "node:path"
import { randomBytes } from "node:crypto"
import { createConnection } from "mysql2/promise"
import { migrate } from "../../scripts/migrate.mjs"
import { renderGrants } from "../../scripts/db-grants.mjs"
import { configureConnection, statements } from "../../scripts/database-common.mjs"
import { seedOrderSearchValues } from "./order-search-seed.mjs"

// Synthetic UUIDv7-shaped keys; separate tables never contain merchant identifiers.
export const seedId = (number) => "019ab00000007000a000" + number.toString(16).padStart(12, "0")
export const canonicalId = (number) => { const hex = seedId(number); return [hex.slice(0,8),hex.slice(8,12),hex.slice(12,16),hex.slice(16,20),hex.slice(20)].join("-") }
const key = (expression) => "UNHEX(CONCAT('019ab00000007000a000',LPAD(HEX(" + expression + "),12,'0')))"

/** Only called after provisioning a fresh loopback QA schema. */
export async function seedPerformanceDatabase(connection, progress = (_phase) => {}) {
  const [[target]] = await connection.query("SELECT DATABASE() AS name")
  if (!/^soledrop_qa_perf[a-f0-9]{10}$/.test(target.name)) throw new Error("Performance seeding requires a newly provisioned disposable schema")
  const [[existing]] = await connection.query("SELECT COUNT(*) AS total FROM stores")
  if (Number(existing.total)) throw new Error("Performance seeding refuses existing data")
  const store = Buffer.from(seedId(1), "hex"), list = Buffer.from(seedId(2), "hex")
  await configureConnection(connection)
  await connection.execute("INSERT INTO stores(id,name,next_order_number) VALUES (?, 'Synthetic performance QA',510001)", [store])
  await connection.execute("INSERT INTO price_lists(id,store_id,code,currency,priority) VALUES (?,?,'retail','PKR',0)", [list, store])
  const brands = ["Nike", "Adidas", "Asics", "Puma", "Reebok", "Converse", "Vans", "Saucony"]
  for (const [position, brand] of brands.entries()) await connection.execute("INSERT INTO brands(id,store_id,slug,name,position) VALUES (?,?,?,?,?)", [Buffer.from(seedId(position + 10), "hex"), store, brand.toLowerCase(), brand, position])
  await connection.query("CREATE TEMPORARY TABLE perf_numbers(n INT NOT NULL PRIMARY KEY) ENGINE=InnoDB")
  for (let start = 1; start <= 500000; start += 10000) await connection.query("INSERT INTO perf_numbers(n) VALUES " + Array.from({ length: 10000 }, (_, offset) => "(" + (start + offset) + ")").join(","))
  for (let start = 1; start <= 100000; start += 10000) {
    const end = start + 9999
    await connection.query("INSERT INTO products(id,store_id,slug,title,brand_id,kind,gender,status,description,condition_grade,position,published_at) SELECT " + key("n+1000") + "," + key("1") + ",CONCAT('perf-shoe-',n),CONCAT(ELT(MOD(n,8)+1,'Nike','Adidas','Asics','Puma','Reebok','Converse','Vans','Saucony'),' Runner model',n)," + key("MOD(n,8)+10") + ",IF(MOD(n,5)=0,'preloved','new'),ELT(MOD(n,4)+1,'men','women','kids','unisex'),'active','Lightweight running shoe',IF(MOD(n,5)=0,'excellent',NULL),n,DATE_SUB('2026-11-08 12:00:00',INTERVAL MOD(n,300) DAY) FROM perf_numbers WHERE n BETWEEN " + start + " AND " + end)
  }
  progress("products")
  const sizes = "(SELECT 0 AS size_index UNION ALL SELECT 1 UNION ALL SELECT 2) size_rows"
  await connection.query("INSERT INTO variants(id,product_id,sku,size_eu,size_uk,size_us,size_cm,position,weight_grams) SELECT " + key("1000000+n*3+size_rows.size_index") + "," + key("n+1000") + ",CONCAT('PF-',n,'-',size_rows.size_index),42+size_rows.size_index,8+size_rows.size_index,9+size_rows.size_index,27+size_rows.size_index,size_rows.size_index,900 FROM perf_numbers CROSS JOIN " + sizes + " WHERE n<=100000")
  await connection.query("INSERT INTO inventory_levels(variant_id,on_hand,reserved) SELECT id,IF(MOD(position,3)=0,0,10),0 FROM variants")
  await connection.query("INSERT INTO prices(price_list_id,variant_id,amount,compare_at) SELECT " + key("2") + ",id,100000+MOD(CONV(RIGHT(HEX(product_id),12),16,10),200)*1000+position*500,IF(MOD(position,2)=0,500000,NULL) FROM variants")
  await connection.query("INSERT INTO product_images(id,product_id,url,alt,width,height,role,position) SELECT " + key("2000000+n") + "," + key("n+1000") + ",'/images/performance-fixture.webp','Synthetic shoe',640,640,'card',0 FROM perf_numbers WHERE n<=100000")
  progress("variants-prices-stock")
  for (let start = 1; start <= 500000; start += 20000) {
    await connection.query("INSERT INTO orders(id,store_id,number,email,phone,status,payment_status,fulfillment_status,currency,subtotal,tax_included,total,shipping_address,shipping_method,payment_method,idempotency_key,access_token_hash,placed_at) SELECT " + key("3000000+n") + "," + key("1") + ",CONCAT('SD',10000+n),CONCAT('buyer',MOD(n,10000),'@performance.example.test'),'03000000000',ELT(MOD(n,5)+1,'confirmed','processing','shipped','delivered','cancelled'),'paid','unfulfilled','PKR',150000,1,150000,JSON_OBJECT('fullName',CONCAT('Synthetic Buyer ',MOD(n,10000)),'phone','03000000000','line1','QA street','city','Karachi','province','Sindh','country','PK'),JSON_OBJECT('code','standard','name','Standard delivery','price',0),'cod',CONCAT('perf-order-',n),SHA2(CONCAT('fake-token-',n),256),DATE_ADD('2025-01-01 00:00:00',INTERVAL n MINUTE) FROM perf_numbers WHERE n BETWEEN " + start + " AND " + (start + 19999))
  }
  progress("orders")
  await connection.query("INSERT INTO order_contacts(order_id,store_id,recipient_name,phone_digits) SELECT id,store_id,JSON_UNQUOTE(JSON_EXTRACT(shipping_address,'$.fullName')),'03000000000' FROM orders")
  await connection.query("INSERT INTO order_lines(id,order_id,variant_id,product_id,slug,title,brand,kind,`condition`,size,image_url,sku,quantity,unit_price,total,position) SELECT " + key("4000000+n") + "," + key("3000000+n") + "," + key("1000000+(MOD(n-1,100000)+1)*3") + "," + key("MOD(n-1,100000)+1001") + ",CONCAT('perf-shoe-',MOD(n-1,100000)+1),'Synthetic purchased shoe','QA','new',NULL,JSON_OBJECT('eu','42','uk','8','us','9','cm','27'),'/images/performance-fixture.webp',CONCAT('PF-',MOD(n-1,100000)+1,'-0'),1,150000,150000,0 FROM perf_numbers")
  progress("order-history")
  // This dataset contains ASCII only; LOWER is exactly the JS backfill mapping.
  await connection.query("INSERT INTO order_search_documents(store_id,order_id,search_text,number_bytes,email_bytes,phone_bytes,phone_digits,status,payment_status,payment_method,placed_at,total) SELECT store_id,id,LOWER(CONCAT(number,CHAR(0),email,CHAR(0),phone,CHAR(0),JSON_UNQUOTE(JSON_EXTRACT(shipping_address,'$.fullName')))),LENGTH(number),LENGTH(email),LENGTH(phone),'03000000000',status,payment_status,payment_method,placed_at,total FROM orders")
  progress("order-search-projection")
  await seedOrderSearchValues(connection, progress)
  await connection.query("INSERT INTO search_documents(product_id,store_id,slug,title,body,prefix) SELECT id,store_id,slug,LOWER(title),'lightweight running shoe',LEFT(LOWER(title),190) FROM products")
  await connection.query("INSERT INTO search_field_terms(product_id,store_id,field,term,position) SELECT id,store_id,'title',LOWER(SUBSTRING_INDEX(title,' ',1)),0 FROM products UNION ALL SELECT id,store_id,'title','runner',1 FROM products UNION ALL SELECT id,store_id,'title',SUBSTRING_INDEX(title,' ',-1),2 FROM products UNION ALL SELECT id,store_id,'body','lightweight',0 FROM products UNION ALL SELECT id,store_id,'body','running',1 FROM products UNION ALL SELECT id,store_id,'body','shoe',2 FROM products")
  await connection.query("INSERT INTO search_document_terms(product_id,term) SELECT DISTINCT product_id,term FROM search_field_terms")
  await connection.query("INSERT INTO search_field_vocabulary(store_id,term,field,document_frequency,length) SELECT store_id,term,field,COUNT(*),LENGTH(CONVERT(term USING utf16))/2 FROM search_field_terms GROUP BY store_id,term,field")
  await connection.query("INSERT INTO search_terms(store_id,term,document_frequency,`length`) SELECT " + key("1") + ",term,COUNT(*),CHAR_LENGTH(term) FROM search_document_terms GROUP BY term")
  await connection.query("INSERT INTO search_skus(store_id,compact,product_id) SELECT " + key("1") + ",REPLACE(LOWER(sku),'-',''),product_id FROM variants")
  progress("search-projections")
  for (const command of statements(await fs.readFile("db/migrations/0015_listing_projections.sql", "utf8"))) if (/^INSERT INTO product_(listing_sizes|list_prices)/.test(command)) await connection.query(command)
  progress("listing-projections")
  await connection.query("DROP TEMPORARY TABLE perf_numbers")
  const counts = {}
  for (const table of ["products", "variants", "inventory_levels", "prices", "orders", "order_lines", "search_documents", "search_field_terms"]) {
    const [[row]] = await connection.query("SELECT COUNT(*) AS total FROM `" + table + "`")
    counts[table] = Number(row.total)
    await connection.query("ANALYZE TABLE `" + table + "`")
  }
  return counts
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("db/performance/seed.mjs")) {
  const directory = path.resolve(".data/performance")
  await fs.mkdir(directory, { recursive: true, mode: 0o700 })
  const output = path.join(directory, "connections.json")
  const selected = process.argv.find((arg) => arg.startsWith("--engine="))?.slice(9)
  if (selected && !["mysql", "mariadb"].includes(selected)) throw new Error("Unknown performance engine")
  let configs = {}
  try {
    configs = JSON.parse(await fs.readFile(output, "utf8"))
    if (!selected || configs[selected]) throw new Error("Performance connections already exist; reuse the recorded disposable datasets")
  } catch (error) { if (error.code !== "ENOENT") throw error }
  const instances = JSON.parse(await fs.readFile(".data/local-engines/instances.json", "utf8"))
  for (const instance of instances.filter((row) => !selected || row.engine === selected)) {
    if (!["mysql", "mariadb"].includes(instance.engine) || instance.host !== "127.0.0.1") throw new Error("Only task-owned loopback engines are accepted")
    const suffix = randomBytes(5).toString("hex"), name = "soledrop_qa_perf" + suffix, app = "sdperf_" + suffix + "_app", migrator = "sdperf_" + suffix + "_ddl", password = randomBytes(24).toString("hex")
    const root = await createConnection({ host: instance.host, port: instance.port, user: "root", password: instance.rootPassword })
    try {
      await root.query("CREATE DATABASE `" + name + "` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci")
      await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [app, password]); await root.query("CREATE USER ?@'%' IDENTIFIED BY ?", [migrator, password])
      await root.query("USE `" + name + "`"); await migrate(root)
      for (const command of statements(await renderGrants({ database: name, app, migrator, host: "%" }))) await root.query(command)
      const url = new URL("mysql://127.0.0.1"); url.port = String(instance.port); url.pathname = "/" + name; url.password = password; url.username = app
      const appUrl = url.href; url.username = migrator
      configs[instance.engine] = { appUrl, migratorUrl: url.href, storeId: canonicalId(1), listId: canonicalId(2), ready: false }
      await fs.writeFile(output, JSON.stringify(configs, null, 2), { mode: 0o600 })
      const counts = await seedPerformanceDatabase(root, (phase) => process.stdout.write(JSON.stringify({ engine: instance.engine, phase }) + "\n"))
      configs[instance.engine].ready = true
      await fs.writeFile(output, JSON.stringify(configs, null, 2), { mode: 0o600 })
      process.stdout.write(JSON.stringify({ engine: instance.engine, counts }) + "\n")
    } finally { await root.end() }
  }
}
