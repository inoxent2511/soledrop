import path from "node:path"

import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: {
    alias: [
      // `server-only` throws outside a React Server Component build; tests run server code directly.
      { find: /^server-only$/, replacement: path.resolve(import.meta.dirname, "tests/stubs/server-only.ts") },
      { find: /^@\//, replacement: `${path.resolve(import.meta.dirname)}/` },
    ],
  },
  test: {
    env: { DATA_DRIVER: "fixtures" },
    include: ["tests/**/*.test.ts"],
    environment: "node",
    // Real-engine contracts run separately through pnpm db:test.
    testTimeout: 60_000,
    hookTimeout: 120_000,
  },
})
