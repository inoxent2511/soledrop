import { AsyncLocalStorage } from "node:async_hooks"
import { createHash, randomUUID } from "node:crypto"
import fs from "node:fs"
import path from "node:path"
import { deserialize, serialize } from "node:v8"

/** Durable, single-process local storage. Hosted deployments use the MySQL driver. */
export class LocalStore<T> {
  readonly directory: string
  private file: string
  private lock: string
  private token = `${process.pid}-${randomUUID()}.owner`
  private queue: Promise<unknown> = Promise.resolve()
  private context = new AsyncLocalStorage<boolean>()
  private state: T
  private digest = ""
  private closed = false
  private closing = false

  constructor(directory: string, initialise: () => T) {
    this.directory = path.resolve(directory)
    fs.mkdirSync(this.directory, { recursive: true, mode: 0o700 })
    this.file = path.join(this.directory, "store.bin")
    this.lock = path.join(this.directory, "store.lock")
    this.acquire()
    try {
      if (fs.existsSync(this.file)) {
        const saved = deserialize(fs.readFileSync(this.file))
        if (saved.version !== 1 || !(saved.state instanceof Uint8Array) || createHash("sha256").update(saved.state).digest("hex") !== saved.digest) throw new Error("Unsupported or damaged local store. Restore a backup; data was not reset.")
        this.state = deserialize(saved.state) as T
        this.digest = saved.digest
      } else this.state = initialise()
      this.persist()
    } catch (error) {
      this.release()
      throw error
    }
    process.once("exit", this.release)
  }

  get value(): T {
    if (this.closed) throw new Error("Local store is closed.")
    return this.state
  }

  private acquire() {
    try { fs.mkdirSync(this.lock, { mode: 0o700 }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error
      if (!fs.statSync(this.lock).isDirectory()) throw new Error("Legacy local store lock found. Verify its process has stopped before removing it.")
      const owners = fs.readdirSync(this.lock)
      const owner = owners.length === 1 ? owners[0] : ""
      const pid = Number(/^(\d+)-[0-9a-f-]+\.owner$/.exec(owner)?.[1])
      if (!Number.isSafeInteger(pid) || pid <= 0) throw new Error("Local store is opening or its lock needs inspection; refusing another writer.")
      let running = true
      try { process.kill(pid, 0) }
      catch (problem) { if ((problem as NodeJS.ErrnoException).code === "ESRCH") running = false; else throw problem }
      if (running) throw new Error("Local store is already open in another server process.")
      // Delete only this dead owner's unique marker. A competing recovery cannot unlink a new
      // owner's marker; rmdir also refuses to remove a directory containing a new marker.
      fs.unlinkSync(path.join(this.lock, owner))
      fs.rmdirSync(this.lock)
      fs.mkdirSync(this.lock, { mode: 0o700 })
    }
    try { fs.writeFileSync(path.join(this.lock, this.token), "", { flag: "wx", mode: 0o600 }) }
    catch (error) { fs.rmdirSync(this.lock); throw error }
  }

  private persist() {
    const state = serialize(this.state)
    const digest = createHash("sha256").update(state).digest("hex")
    if (digest === this.digest) return
    const bytes = serialize({ version: 1, state, digest })
    const temporary = `${this.file}.${randomUUID()}.tmp`
    const fd = fs.openSync(temporary, "wx", 0o600)
    try {
      fs.writeFileSync(fd, bytes)
      fs.fsyncSync(fd)
    } finally {
      fs.closeSync(fd)
    }
    try {
      fs.renameSync(temporary, this.file)
      this.digest = digest
    } finally {
      if (fs.existsSync(temporary)) fs.unlinkSync(temporary)
    }
  }

  /** Serialize repository calls; failed operations restore memory and never replace the saved file. */
  async run<R>(work: (state: T) => R | Promise<R>): Promise<R> {
    if (this.context.getStore()) return work(this.value)
    if (this.closing) throw new Error("Local store is closing.")
    const operation = this.queue.then(() => this.context.run(true, async () => {
      const before = serialize(this.value)
      try {
        const result = await work(this.value)
        this.persist()
        return result
      } catch (error) {
        this.state = deserialize(before) as T
        throw error
      }
    }))
    this.queue = operation.catch(() => undefined)
    return operation
  }

  private release = () => {
    const marker = path.join(this.lock, this.token)
    if (fs.existsSync(marker)) { fs.unlinkSync(marker); fs.rmdirSync(this.lock) }
  }

  async close() {
    this.closing = true
    await this.queue
    this.closed = true
    this.release()
    process.removeListener("exit", this.release)
  }
}
