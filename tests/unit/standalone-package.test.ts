import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { afterEach, expect, it } from "vitest"
import { verifyStandalone } from "../../scripts/verify-standalone.mjs"

const directories: string[] = []
function temporary() {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), "soledrop-artifact-test-")), directory = path.join(parent, "release")
  directories.push(parent); fs.mkdirSync(directory)
  return { parent, directory }
}
afterEach(() => {
  for (const directory of directories.splice(0)) {
    if (!path.resolve(directory).startsWith(path.resolve(os.tmpdir()) + path.sep + "soledrop-artifact-test-")) throw new Error("Invalid artifact test cleanup")
    fs.rmSync(directory, { recursive: true, force: true })
  }
})

it("accepts a clean release and refuses an embedded private key without printing its value", () => {
  const { directory } = temporary(), secret = "fake-test-private-key-" + "x".repeat(32)
  fs.writeFileSync(path.join(directory, "server.js"), "export const ready = true")
  expect(verifyStandalone(directory, { SESSION_SECRET: secret })).toEqual({ scanned: 1, findings: 0 })
  fs.writeFileSync(path.join(directory, "server.js"), JSON.stringify(secret))
  try { verifyStandalone(directory, { SESSION_SECRET: secret }); throw new Error("Expected a private key finding") }
  catch (error) {
    expect(error).toBeInstanceOf(Error)
    expect((error as Error).message).toContain("Embedded SESSION_SECRET")
    expect((error as Error).message).not.toContain(secret)
  }
})

it("refuses private runtime paths and links outside the self-contained release", () => {
  const { parent, directory } = temporary()
  fs.mkdirSync(path.join(directory, ".data"))
  fs.writeFileSync(path.join(directory, ".data", "store.bin"), "fake test snapshot")
  expect(() => verifyStandalone(directory, {})).toThrow("Private runtime path")
  const clean = path.join(parent, "clean"), source = path.join(parent, "source")
  fs.mkdirSync(clean); fs.mkdirSync(source)
  fs.symlinkSync(source, path.join(clean, "dependency"), process.platform === "win32" ? "junction" : "dir")
  expect(() => verifyStandalone(clean, {})).toThrow("External artifact link")
})
