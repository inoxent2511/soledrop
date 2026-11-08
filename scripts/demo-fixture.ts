import fs from "node:fs/promises"

// Generation only reads public fixture definitions, independent of a developer's active driver.
process.env.DATA_DRIVER = "fixtures"
process.env.ADMIN_DEMO_STAFF = "off"
const { demoFixture } = await import("@/server/fixtures/demo")
await fs.writeFile("db/seed/demo.json", demoFixture())
console.log("Generated isolated public QA fixture; merchant data was not read.")
