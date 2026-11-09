/** Bulk equivalent of the JS index for this strictly ASCII synthetic dataset. */
export async function seedOrderSearchValues(connection, progress = (_phase) => {}) {
  const [[target]] = await connection.query("SELECT DATABASE() AS name")
  if (!/^soledrop_qa_perf[a-f0-9]{10}$/.test(target.name)) throw new Error("Synthetic order index requires an owned performance schema")
  const fields = [
    "SELECT store_id,id AS order_id,0 AS kind,LOWER(number) AS normalized_text FROM orders",
    "SELECT store_id,id,0,LOWER(email) FROM orders",
    "SELECT store_id,id,0,LOWER(phone) FROM orders",
    "SELECT store_id,id,0,LOWER(JSON_UNQUOTE(JSON_EXTRACT(shipping_address,'$.fullName'))) FROM orders",
    "SELECT store_id,order_id,1,phone_digits FROM order_contacts",
  ].join(" UNION ALL ")
  const digest = "UNHEX(SHA2(CONCAT(kind,CHAR(0),normalized_text),256))"
  await connection.query("INSERT IGNORE INTO order_search_values(store_id,value_hash,kind,normalized_text) SELECT store_id," + digest + ",kind,normalized_text FROM (" + fields + ") synthetic_values WHERE normalized_text<>''")
  progress("order-values")
  await connection.query("INSERT IGNORE INTO order_search_links(store_id,order_id,value_hash) SELECT store_id,order_id," + digest + " FROM (" + fields + ") synthetic_values WHERE normalized_text<>''")
  progress("order-links")
  await connection.query("CREATE TEMPORARY TABLE synthetic_gram_positions(n INT PRIMARY KEY)")
  await connection.query("INSERT INTO synthetic_gram_positions(n) VALUES " + Array.from({ length: 300 }, (_, index) => "(" + (index + 1) + ")").join(","))
  const [stores] = await connection.query("SELECT DISTINCT store_id FROM order_search_values")
  let processed = 0
  for (const { store_id: storeId } of stores) {
    let cursor = Buffer.alloc(32)
    for (;;) {
      const [rows] = await connection.execute("SELECT value_hash FROM order_search_values WHERE store_id=? AND value_hash>? ORDER BY value_hash LIMIT 5000", [storeId, cursor])
      if (!rows.length) break
      const last = rows.at(-1).value_hash
      await connection.execute("INSERT IGNORE INTO order_search_grams(store_id,gram,value_hash) SELECT v.store_id,CAST(SUBSTRING(v.normalized_text,p.n,w.width) AS BINARY) AS gram,v.value_hash FROM order_search_values v INNER JOIN synthetic_gram_positions p ON p.n<=CHAR_LENGTH(v.normalized_text) CROSS JOIN (SELECT 1 AS width UNION ALL SELECT 2 UNION ALL SELECT 3) w WHERE v.store_id=? AND v.value_hash>? AND v.value_hash<=? AND p.n+w.width-1<=CHAR_LENGTH(v.normalized_text) ORDER BY v.store_id,gram,v.value_hash", [storeId, cursor, last])
      cursor = last; processed += rows.length
      if (processed % 50000 === 0) progress("order-gram-values-" + processed)
    }
  }
  await connection.query("DROP TEMPORARY TABLE synthetic_gram_positions")
  await connection.query("UPDATE order_search_documents SET search_version=1")
  await connection.query("ANALYZE TABLE order_search_values,order_search_grams,order_search_links,order_search_documents")
  progress("order-substring-index")
}
