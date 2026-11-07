import path from "node:path"
import { defineConfig } from "vitest/config"

export default defineConfig({
  resolve: { alias: [
    { find: /^server-only$/, replacement: path.resolve("tests/stubs/server-only.ts") },
    { find: /^@\//, replacement: path.resolve(".") + "/" },
  ] },
  test: {
    env: { DATA_DRIVER: "fixtures" },
    include: ["db/tests/**/*.test.ts"],
    environment: "node", fileParallelism: false,
    testTimeout: 60_000, hookTimeout: 120_000,
  },
})
