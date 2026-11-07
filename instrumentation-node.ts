/** Node-only start-up check, imported by instrumentation.ts on the Node runtime only. */
export async function validateEnvironment() {
  try {
    await import("@/lib/env.server")
    if (process.env.NEXT_PHASE !== "phase-production-build") {
      // Warm the random dummy credential before traffic, avoiding an extra cold unknown-user hash.
      const { decoyHash } = await import("@/server/customers/password")
      await decoyHash()
    }
  } catch (error) {
    console.error(JSON.stringify({ level: "fatal", at: new Date().toISOString(), message: "Invalid server environment (see .env.example)", detail: error instanceof Error ? error.message : String(error) }))
    // A server that answers every request with 500 is worse than one that does not start.
    if (process.env.NODE_ENV === "production") process.exit(1)
    throw error
  }
}
