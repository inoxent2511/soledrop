import { createConnection, type Connection } from "mysql2/promise"
import { configureConnection } from "../../scripts/database-common.mjs"

type TestConnection = { migratorUrl: string; appUrl: string }
const configuration = JSON.parse(process.env.DB_TEST_CONNECTIONS ?? "{}") as Record<string, TestConnection>
if (!Object.keys(configuration).length) throw new Error("Run pnpm db:test with local test connections")

export const engines = Object.entries(configuration)

export async function connect(url: string): Promise<Connection> {
  const parsed = new URL(url)
  if (!["127.0.0.1", "localhost", "[::1]"].includes(parsed.hostname) || !/^\/soledrop_(test|qa)(_[a-z0-9]+)?$/.test(parsed.pathname)) throw new Error("Tests cannot access remote or merchant databases")
  const connection = await createConnection({ uri: url, timezone: "Z", dateStrings: true, supportBigNumbers: true, bigNumberStrings: true })
  await configureConnection(connection)
  return connection
}
