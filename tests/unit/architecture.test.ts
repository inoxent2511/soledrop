import fs from "node:fs"
import path from "node:path"
import ts from "typescript"

import { describe, expect, it } from "vitest"

/** Static rules from the build brief, checked on every run so they can't quietly regress. */
const ROOT = path.resolve(import.meta.dirname, "../..")

function files(dir: string, pattern: RegExp): string[] {
  const absolute = path.join(ROOT, dir)
  if (!fs.existsSync(absolute)) return []
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = path.join(dir, entry.name)
    if (entry.isDirectory()) return files(relative, pattern)
    return pattern.test(entry.name) ? [relative] : []
  })
}

const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8")
const SOURCE_DIRS = ["app", "components", "features", "hooks", "lib", "server", "api", "content", "context"]
const source = SOURCE_DIRS.flatMap((dir) => files(dir, /\.(ts|tsx)$/)).filter((file) => !file.endsWith("cn-tables.ts"))
const ui = source.filter((file) => file.endsWith(".tsx"))

describe("form submission protocol", () => {
  it("keeps client-handled form details out of native GET URLs", () => {
    const unsafe: string[] = []
    for (const file of ui) {
      const tree = ts.createSourceFile(file, read(file), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText(tree) === "form") {
          const attributes = node.attributes.properties.filter(ts.isJsxAttribute)
          const value = (name: string) => {
            const attribute = attributes.find(item => item.name.getText(tree) === name)
            return attribute?.initializer && ts.isStringLiteral(attribute.initializer) ? attribute.initializer.text : undefined
          }
          if (attributes.some(item => item.name.getText(tree) === "onSubmit") && value("role") !== "search" && !["post", "dialog"].includes(value("method") ?? "")) {
            unsafe.push(`${file}:${tree.getLineAndCharacterOfPosition(node.getStart(tree)).line + 1}`)
          }
        }
        ts.forEachChild(node, visit)
      }
      visit(tree)
    }
    expect(unsafe).toEqual([])
  })
})

describe("data seam", () => {
  it("initialises browser schemas through the CSP-safe validation module", () => {
    const browserSchemas = source.filter((file) => file.startsWith(`features${path.sep}`) || file === path.join("lib", "env.ts"))
    for (const file of browserSchemas) {
      const text = read(file)
      if (/^import (?!type )[^\n]*from "zod(?:\/mini)?"/m.test(text)) expect(text, file).toMatch(/^(?:"use client"\r?\n\r?\n)?import "@\/lib\/validation"\r?\n/)
    }
  })

  it("gives every repository mysql and fixtures implementations behind one index", () => {
    const domains = fs.readdirSync(path.join(ROOT, "server")).filter((name) => fs.existsSync(path.join(ROOT, "server", name, "repository.ts")))
    expect(domains.length).toBeGreaterThan(8)
    for (const domain of domains) {
      for (const file of ["mysql.repository.ts", "fixtures.repository.ts", "index.ts"]) {
        expect(fs.existsSync(path.join(ROOT, "server", domain, file)), `server/${domain}/${file}`).toBe(true)
      }
    }
  })

  it("keeps server code out of client components (type-only imports are erased)", () => {
    for (const file of source.filter((name) => /^["']use client["']/.test(read(name)))) {
      expect(read(file), file).not.toMatch(/^import (?!type )[^\n]*from ["']@\/server\//m)
      expect(read(file), file).not.toMatch(/env\.server/)
    }
  })

  it("documents every environment variable in .env.example", () => {
    const example = new Set([...read(".env.example").matchAll(/^([A-Z0-9_]+)=/gm)].map((match) => match[1]))
    const declared = [read("lib/env.server.ts"), read("lib/env.ts")].flatMap((text) => [...text.matchAll(/^ +([A-Z][A-Z0-9_]+): (?!process\.env)/gm)].map((match) => match[1]))
    expect(declared.length).toBeGreaterThanOrEqual(25)
    for (const key of declared.filter((name) => name !== "NODE_ENV")) expect(example.has(key), key).toBe(true)
  })

  it("reads database credentials only in server configuration and pool infrastructure", () => {
    const readers = source.filter((file) => read(file).includes("DATABASE_URL"))
    expect(readers.sort()).toEqual([path.join("lib", "env.server.ts"), path.join("server", "db", "client.ts")].sort())
    expect(read("lib/env.server.ts")).toMatch(/^import "server-only"/)
  })
})

describe("routing", () => {
  it("puts no loading boundary above a page that can 404 or redirect (a streamed fallback commits status 200)", () => {
    const loaders = files("app", /^loading\.tsx$/).map((file) => path.dirname(file) + path.sep)
    // The app may have no loaders at all (search dropped its own, D-042); the pages under test must be found.
    const guarded = files("app", /^page\.tsx$/).filter((file) => /\b(?:notFound|redirect|permanentRedirect)\(/.test(read(file)))
    expect(guarded.length).toBeGreaterThan(3)
    for (const page of guarded) {
      expect(loaders.filter((dir) => page.startsWith(dir)), page).toEqual([])
    }
  })
})

describe("styling", () => {
  it("uses tokens instead of raw colours and arbitrary sizes", () => {
    for (const file of ui) {
      const text = read(file)
      expect(text, file).not.toMatch(/className=[^\n]*#[0-9a-fA-F]{3,8}\b/)
      expect(text, file).not.toMatch(/\b(?:text|p[xytrbl]?|m[xytrbl]?|gap|w|h|top|bottom|start|end|rounded)-\[\d/)
    }
  })

  it("uses logical directions only", () => {
    for (const file of ui) {
      const text = read(file)
      expect(text, file).not.toMatch(/["'\s:](?:-?m[lr]|p[lr]|border-[lr]|rounded-[lr]|-?left|-?right)-[\w[]/)
      expect(text, file).not.toMatch(/["'\s:](?:text|float)-(?:left|right)\b/)
    }
  })
})

describe("hygiene", () => {
  it("leaves no TODO or FIXME markers", () => {
    for (const file of [...source, ...files("db/migrations", /\.sql$/), ...files("tests", /\.ts$/)].filter((name) => !name.endsWith("architecture.test.ts"))) {
      expect(read(file), file).not.toMatch(/\b(TODO|FIXME)\b/)
    }
  })

  it("keeps query authorization explicit and uses no privileged SQL routines or triggers", () => {
    for (const file of files("db/migrations", /\.sql$/)) {
      expect(read(file), file).not.toMatch(/CREATE\s+(?:DEFINER\s*=\s*\S+\s+)?(?:TRIGGER|FUNCTION|PROCEDURE)|SECURITY\s+DEFINER/i)
    }
    expect(read("server/db/policy.repository.ts")).toMatch(/assertActor\(actor\)/)
    expect(read("server/db/fixtures-policy.repository.ts")).toMatch(/assertActor\(actor\)/)
  })

  it("names forward migrations in unique sequence order", () => {
    const names = files("db/migrations", /\.sql$/).map((file) => path.basename(file))
    expect(names.length).toBeGreaterThan(0)
    for (const name of names) expect(name).toMatch(/^\d{4}_[a-z0-9_]+\.sql$/)
    expect(new Set(names.map((name) => name.slice(0, 4))).size).toBe(names.length)
    expect([...names].sort()).toEqual(names)
  })
})

describe("admin access (A-006)", () => {
  const handlers = files(path.join("app", "api", "admin"), /^route\.ts$/)
  const shellPages = files(path.join("app", "(admin)", "admin", "(shell)"), /^page\.tsx$/)

  it("wraps every admin route handler in adminRoute with a declared access", () => {
    expect(handlers.length).toBeGreaterThan(5)
    for (const file of handlers) {
      const text = read(file)
      // Formatting may wrap the call, so the declaration is read across lines.
      const exported = [...text.matchAll(/^export (?:async )?(?:const|function) (GET|POST|PUT|PATCH|DELETE)\b([\s\S]{0,300})/gm)]
      expect(exported.length, file).toBeGreaterThan(0)
      for (const [, method, rest] of exported) {
        expect(rest, `${file} ${method}`).toMatch(/^ = adminRoute(?:<[^(]*>)?\(\s*(?:"(public|pending|staff|[a-z_]+:[a-z_]+)"|\{\s*permission: "[a-z_]+:[a-z_]+",\s*stepUp: true,?\s*\})/)
      }
    }
  })

  it("keeps public admin handlers to sign-in, invites and sign-out", () => {
    const publicHandlers = handlers.filter((file) => /adminRoute(?:<[^(]*>)?\(\s*"public"/.test(read(file))).map((file) => file.split(path.sep).join("/"))
    expect(publicHandlers.sort()).toEqual(["app/api/admin/auth/invite/[token]/route.ts", "app/api/admin/auth/login/route.ts", "app/api/admin/auth/logout/route.ts"])
  })

  it("checks a permission on every shell page (account and no-access only need a session)", () => {
    expect(shellPages.length).toBeGreaterThan(2)
    for (const file of shellPages) {
      const text = read(file)
      const sessionOnly = /\/(account|no-access)\/page\.tsx$/.test(file.split(path.sep).join("/"))
      expect(text, file).toMatch(sessionOnly ? /await staffPage\(/ : /await permissionPage\("[a-z_]+:[a-z_]+"/)
    }
  })

  it("gives every sidebar module a page", () => {
    const registry = read(path.join("features", "admin", "modules.ts"))
    const hrefs = [...registry.matchAll(/href: "(\/admin[^"]*)"/g)].map((match) => match[1])
    expect(hrefs.length).toBeGreaterThan(15)
    for (const href of hrefs) {
      const page = path.join("app", "(admin)", "admin", "(shell)", ...href.split("/").slice(2), "page.tsx")
      expect(fs.existsSync(path.join(ROOT, page)), href).toBe(true)
    }
  })

  it("keeps the admin DAL and route wrapper server-only", () => {
    for (const file of ["server/admin/dal.ts", "server/admin/route.ts", "server/admin/service.ts", "server/admin/index.ts"]) expect(read(file), file).toMatch(/^import "server-only"/)
  })
})

describe("admin isolation", () => {
  it("keeps admin code out of the storefront's routes and components", () => {
    const storefront = [...files(path.join("app", "(store)"), /\.(ts|tsx)$/), ...files(path.join("app", "(home)"), /\.(ts|tsx)$/), ...files(path.join("app", "(checkout)"), /\.(ts|tsx)$/), ...files(path.join("features"), /\.(ts|tsx)$/).filter((file) => !file.includes(`${path.sep}admin${path.sep}`)), ...files("components", /\.(ts|tsx)$/).filter((file) => !file.includes(`${path.sep}admin${path.sep}`))]
    expect(storefront.length).toBeGreaterThan(30)
    for (const file of storefront) expect(read(file), file).not.toMatch(/from "@\/(components|features)\/admin\/|from "@\/server\/admin/)
  })
})
