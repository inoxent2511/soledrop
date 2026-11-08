import fs from "node:fs/promises"
import path from "node:path"
import { createHash } from "node:crypto"
import { pathToFileURL } from "node:url"

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex")

/** Copy metadata-referenced originals and every prepared variant, retaining immutable disk keys. */
export async function backupUploads(sourceDirectory, targetDirectory, mediaPaths) {
  const source = path.resolve(sourceDirectory), target = path.resolve(targetDirectory)
  if (source === target || target.startsWith(source + path.sep) || source.startsWith(target + path.sep)) throw new Error("Separate upload backup directories are required")
  const sourceStat = await fs.lstat(source)
  if (!sourceStat.isDirectory() || sourceStat.isSymbolicLink()) throw new Error("Invalid source storage directory")
  await fs.mkdir(target, { mode: 0o700 })
  const files = []
  for (const key of new Set(mediaPaths)) {
    if (typeof key !== "string" || !key || key.length > 512 || /[\\\x00-\x1f]/.test(key) || path.isAbsolute(key) || key.split("/").some((part) => !part || part === "." || part === "..")) throw new Error("Invalid media key")
    const keys = [key, ...[320, 640, 960, 1280, 1920, 2400].flatMap((width) => [key + ".v1.w" + width + ".webp", key + ".v1.w" + width + ".avif"])]
    for (const objectKey of keys) {
      const hash = sha256(objectKey), relative = hash.slice(0, 2) + "/" + hash, origin = path.join(source, relative), destination = path.join(target, relative)
      const parent = await fs.lstat(path.dirname(origin)), stat = await fs.lstat(origin)
      if (!parent.isDirectory() || parent.isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid storage object")
      const bytes = await fs.readFile(origin)
      await fs.mkdir(path.dirname(destination), { recursive: true, mode: 0o700 })
      await fs.writeFile(destination, bytes, { flag: "wx", mode: 0o600 })
      files.push({ file: relative, bytes: bytes.length, sha256: sha256(bytes) })
    }
  }
  return { originals: new Set(mediaPaths).size, files }
}

export async function verifyUploads(directory, manifest) {
  const root = path.resolve(directory)
  if ((await fs.lstat(root)).isSymbolicLink()) throw new Error("Invalid storage directory")
  for (const file of manifest.files) {
    if (!/^[a-f0-9]{2}\/[a-f0-9]{64}$/.test(file.file)) throw new Error("Invalid upload manifest path")
    const location = path.join(root, file.file), parent = await fs.lstat(path.dirname(location)), stat = await fs.lstat(location)
    if (!parent.isDirectory() || parent.isSymbolicLink() || !stat.isFile() || stat.isSymbolicLink()) throw new Error("Invalid restored storage object")
    const bytes = await fs.readFile(location)
    if (bytes.length !== file.bytes || sha256(bytes) !== file.sha256) throw new Error("Upload checksum mismatch")
  }
  return { originals: manifest.originals, files: manifest.files.length }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [action, source, destination, manifestFile] = process.argv.slice(2)
  if (action !== "backup" || !source || !destination || !manifestFile || ![source, destination, manifestFile].every(path.isAbsolute)) throw new Error("Use backup-uploads.mjs backup <absolute-storage> <absolute-new-private-directory> <absolute-sql-manifest>")
  const root = process.cwd(), target = path.resolve(destination)
  if ((target === root || target.startsWith(root + path.sep)) && !target.startsWith(path.resolve(".data") + path.sep)) throw new Error("Uploads must remain outside release sources")
  const input = JSON.parse(await fs.readFile(manifestFile, "utf8"))
  const manifest = await backupUploads(source, destination, input.mediaPaths)
  await fs.writeFile(destination + ".manifest.json", JSON.stringify(manifest, null, 2), { flag: "wx", mode: 0o600 })
  process.stdout.write(JSON.stringify(await verifyUploads(destination, manifest)) + "\n")
}
