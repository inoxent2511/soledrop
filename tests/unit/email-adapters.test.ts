import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import net from "node:net"
import { afterEach, describe, expect, it } from "vitest"
import { createSmtpEmailProvider } from "@/server/adapters/email/smtp"
import { createFileEmailProvider } from "@/server/adapters/email/file"

const cleanup: (() => Promise<void>)[] = []
afterEach(async () => { for (const close of cleanup.splice(0).reverse()) await close() })
const message = { to: "recipient@example.test", subject: "Local adapter check", text: "Private local message", html: "<p>Private local message</p>", idempotencyKey: "event-one" }

async function localSmtp(rejectRecipient = false) {
  const messages: string[] = [], sockets = new Set<net.Socket>()
  const server = net.createServer((socket) => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket))
    socket.write("220 local.test ESMTP\r\n")
    let buffer = "", data: string[] | null = null
    socket.on("data", (chunk) => {
      buffer += chunk.toString()
      for (let end; (end = buffer.indexOf("\r\n")) >= 0;) {
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2)
        if (data) {
          if (line === ".") { messages.push(data.join("\r\n")); data = null; socket.write("250 accepted\r\n") }
          else data.push(line)
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250-local.test\r\n250 SIZE 1000000\r\n")
        else if (/^MAIL FROM/.test(line)) socket.write("250 sender accepted\r\n")
        else if (/^RCPT TO/.test(line)) socket.write(rejectRecipient ? "550 recipient rejected\r\n" : "250 recipient accepted\r\n")
        else if (line === "DATA") { data = []; socket.write("354 send data\r\n") }
        else if (line === "QUIT") socket.end("221 goodbye\r\n")
        else socket.write("250 ok\r\n")
      }
    })
  })
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve))
  cleanup.push(async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>((resolve) => server.close(() => resolve())) })
  const address = server.address()
  if (!address || typeof address === "string") throw new Error("Missing local SMTP address")
  return { messages, provider: createSmtpEmailProvider({ host: "127.0.0.1", port: address.port, secure: false, allowInsecureLoopback: true, from: "sender@example.test" }) }
}

describe("private file and SMTP adapters", () => {
  it("writes one private MIME message atomically across simultaneous sends and provider restarts", async () => {
    const directory = await fs.mkdtemp(path.join(os.tmpdir(), "soledrop-email-"))
    cleanup.push(() => fs.rm(directory, { recursive: true, force: true }))
    const provider = createFileEmailProvider(directory, "sender@example.test")
    const sent = await Promise.all([provider.send(message), provider.send(message)])
    expect(sent[0]).toEqual(sent[1])
    await createFileEmailProvider(directory, "sender@example.test").send(message)
    const files = await fs.readdir(directory)
    expect(files).toHaveLength(1)
    expect(files[0]).toMatch(/^[0-9a-f]{64}\.eml$/)
    const bytes = await fs.readFile(path.join(directory, files[0]), "utf8")
    expect(bytes).toContain("Private local message")
    expect(bytes).toMatch(/Message-ID:\s+</)
    if (process.platform !== "win32") expect((await fs.stat(path.join(directory, files[0]))).mode & 0o077).toBe(0)
  })
  it("verifies and sends MIME to a real loopback SMTP receiver with a stable Message-ID", async () => {
    const { provider, messages } = await localSmtp()
    expect(await provider.verify!()).toBe(true)
    const first = await provider.send(message), second = await provider.send(message)
    expect(first.id).toBe(second.id)
    expect(messages).toHaveLength(2)
    expect(messages[0]).toContain("Private local message")
    // SMTP itself is at least once; durable outbox channel receipts provide normal retry deduplication.
  })
  it("propagates SMTP recipient rejection and refuses plaintext outside loopback", async () => {
    const { provider } = await localSmtp(true)
    await expect(provider.send(message)).rejects.toBeInstanceOf(Error)
    expect(() => createSmtpEmailProvider({ host: "mail.example.test", port: 25, secure: false, allowInsecureLoopback: true, from: "sender@example.test" })).toThrow("only for local tests")
  })
})
