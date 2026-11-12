/**
 * The admin permission registry (A-007): every permission and preset role, in one typed place.
 * The database (`permissions`, system `roles`), the roles UI, the permission-matrix doc and the
 * permission tests are all generated from this file. Pure: no React, no I/O.
 */

export const PERMISSION_GROUPS = [
  "Dashboard",
  "Orders",
  "Catalogue",
  "Customers",
  "Marketing",
  "Content",
  "Money",
  "Setup",
  "Staff",
] as const

export type PermissionGroup = (typeof PERMISSION_GROUPS)[number]

type Definition = { label: string; group: PermissionGroup; sensitive?: true }

/** `resource:action` → what it allows. `sensitive` actions also need a fresh second factor (A-003). */
export const PERMISSIONS = {
  "dashboard:read": { label: "See the dashboard", group: "Dashboard" },

  "orders:read": { label: "See orders", group: "Orders" },
  "orders:write": { label: "Edit orders (notes, address before fulfilment)", group: "Orders" },
  "orders:fulfil": { label: "Fulfil and ship orders", group: "Orders" },
  "orders:mark_paid": { label: "Record payments (bank transfer, cash on delivery)", group: "Orders" },
  "orders:cancel": { label: "Cancel orders", group: "Orders" },
  "orders:refund": { label: "Refund orders (up to the role's limit)", group: "Orders", sensitive: true },
  "orders:returns": { label: "Receive returns and restock", group: "Orders" },
  "orders:export": { label: "Export orders", group: "Orders" },

  "products:read": { label: "See products", group: "Catalogue" },
  "products:write": { label: "Create and edit products", group: "Catalogue" },
  "products:publish": { label: "Publish and unpublish products", group: "Catalogue" },
  "products:delete": { label: "Archive products", group: "Catalogue", sensitive: true },
  "products:import": { label: "Import products", group: "Catalogue" },
  "products:export": { label: "Export products", group: "Catalogue" },
  "collections:read": { label: "See collections", group: "Catalogue" },
  "collections:write": { label: "Edit collections", group: "Catalogue" },
  "inventory:read": { label: "See stock", group: "Catalogue" },
  "inventory:adjust": { label: "Adjust stock", group: "Catalogue" },
  "media:read": { label: "See media", group: "Catalogue" },
  "media:write": { label: "Upload and edit media", group: "Catalogue" },

  "customers:read": { label: "See customers (contact details masked)", group: "Customers" },
  "customers:read_pii": { label: "See customer email, phone and address", group: "Customers" },
  "customers:write": { label: "Edit customers", group: "Customers" },
  "customers:export": { label: "Export customer data", group: "Customers", sensitive: true },
  "customers:delete": { label: "Anonymise customers", group: "Customers", sensitive: true },

  "promotions:read": { label: "See promotions", group: "Marketing" },
  "promotions:write": { label: "Create and edit promotions", group: "Marketing" },
  "marketing:read": { label: "See newsletter and abandoned carts", group: "Marketing" },
  "marketing:export": { label: "Export subscribers", group: "Marketing", sensitive: true },
  "search:read": { label: "See search analytics", group: "Marketing" },
  "search:write": { label: "Edit search synonyms", group: "Marketing" },

  "content:read": { label: "See pages and FAQs", group: "Content" },
  "content:write": { label: "Edit pages and FAQs", group: "Content" },
  "content:publish": { label: "Publish pages and FAQs", group: "Content" },
  "reviews:read": { label: "See customer reviews", group: "Content" },
  "reviews:write": { label: "Approve, hide and feature customer reviews", group: "Content" },

  "payments:read": { label: "See payments and refunds", group: "Money" },
  "payments:reconcile": { label: "Reconcile payments", group: "Money" },
  "reports:read": { label: "See reports", group: "Money" },
  "reports:export": { label: "Export reports", group: "Money" },
  "pricing:read": { label: "See price lists and exchange rates", group: "Money" },
  "pricing:write": { label: "Edit price lists and exchange rates", group: "Money" },

  "shipping:read": { label: "See shipping and tax", group: "Setup" },
  "shipping:write": { label: "Edit shipping and tax", group: "Setup" },
  "settings:read": { label: "See settings", group: "Setup" },
  "settings:write": { label: "Edit store settings", group: "Setup" },
  "settings:flags": { label: "Switch feature flags", group: "Setup" },
  "settings:payments": { label: "Change payment settings", group: "Setup", sensitive: true },
  "settings:webhooks": { label: "Manage webhook endpoints", group: "Setup", sensitive: true },
  "settings:api_keys": { label: "Manage API keys", group: "Setup", sensitive: true },
  "jobs:run": { label: "Run scheduled jobs", group: "Setup" },

  "staff:read": { label: "See staff and roles", group: "Staff" },
  "staff:manage": { label: "Invite, suspend and reset staff", group: "Staff", sensitive: true },
  "roles:manage": { label: "Create and edit roles", group: "Staff", sensitive: true },
  "audit:read": { label: "See the audit log", group: "Staff" },
} as const satisfies Record<string, Definition>

export type Permission = keyof typeof PERMISSIONS

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[]

export const isPermission = (value: string): value is Permission => value in PERMISSIONS

export const isSensitive = (permission: Permission): boolean => "sensitive" in PERMISSIONS[permission]

export type PresetRole = {
  key: string
  name: string
  description: string
  permissions: readonly Permission[]
  /** Highest single refund in minor units (paisa); null = no ceiling. */
  refundLimit: number | null
}

const reads = ALL_PERMISSIONS.filter((permission) => permission.endsWith(":read") && permission !== "customers:read_pii" && permission !== "audit:read")
const except = (...excluded: Permission[]) => ALL_PERMISSIONS.filter((permission) => !excluded.includes(permission))

/** Preset roles (system roles: cannot be deleted; Owner cannot be edited). */
export const PRESET_ROLES: readonly PresetRole[] = [
  { key: "owner", name: "Owner", description: "Everything. The store always keeps at least one active Owner.", permissions: ALL_PERMISSIONS, refundLimit: null },
  { key: "admin", name: "Admin", description: "Runs the store day to day, including staff.", permissions: ALL_PERMISSIONS, refundLimit: null },
  {
    key: "store_manager",
    name: "Store Manager",
    description: "Orders, catalogue, promotions and content; no staff, roles, payment, webhook or API-key settings.",
    permissions: except("staff:manage", "roles:manage", "settings:payments", "settings:webhooks", "settings:api_keys", "customers:delete"),
    refundLimit: 10_000_000,
  },
  {
    key: "catalogue_editor",
    name: "Catalogue Editor",
    description: "Keeps products, collections, stock and media right.",
    permissions: [
      "dashboard:read",
      "products:read",
      "products:write",
      "products:publish",
      "products:import",
      "products:export",
      "collections:read",
      "collections:write",
      "inventory:read",
      "inventory:adjust",
      "media:read",
      "media:write",
      "pricing:read",
    ],
    refundLimit: 0,
  },
  {
    key: "content_editor",
    name: "Content Editor",
    description: "Policy pages, FAQs and media.",
    permissions: ["dashboard:read", "content:read", "content:write", "content:publish", "reviews:read", "reviews:write", "media:read", "media:write"],
    refundLimit: 0,
  },
  {
    key: "marketing",
    name: "Marketing",
    description: "Promotions, newsletter, search and reports.",
    permissions: [
      "dashboard:read",
      "promotions:read",
      "promotions:write",
      "marketing:read",
      "marketing:export",
      "search:read",
      "search:write",
      "reports:read",
      "products:read",
      "collections:read",
      "customers:read",
      "content:read",
    ],
    refundLimit: 0,
  },
  {
    key: "support_agent",
    name: "Support Agent",
    description: "Answers customers: orders, notes, cancellations, small refunds.",
    permissions: [
      "dashboard:read",
      "orders:read",
      "orders:write",
      "orders:cancel",
      "orders:refund",
      "orders:returns",
      "customers:read",
      "customers:read_pii",
      "customers:write",
      "products:read",
      "inventory:read",
    ],
    refundLimit: 500_000,
  },
  {
    key: "fulfilment",
    name: "Fulfilment",
    description: "Packs and ships orders, keeps stock right.",
    permissions: ["dashboard:read", "orders:read", "orders:fulfil", "orders:returns", "products:read", "inventory:read", "inventory:adjust"],
    refundLimit: 0,
  },
  {
    key: "finance",
    name: "Finance",
    description: "Payments, refunds, reconciliation and reports.",
    permissions: [
      "dashboard:read",
      "orders:read",
      "orders:mark_paid",
      "orders:refund",
      "orders:export",
      "payments:read",
      "payments:reconcile",
      "reports:read",
      "reports:export",
      "pricing:read",
      "customers:read",
      "customers:read_pii",
    ],
    refundLimit: 50_000_000,
  },
  { key: "read_only", name: "Read-only", description: "Sees everything except customer contact details and the audit log; changes nothing.", permissions: reads, refundLimit: 0 },
]

export const OWNER_ROLE_KEY = "owner"

/** Markdown role × permission matrix for docs/app/admin/permissions.md (kept in sync by a test). */
export function renderPermissionMatrix(): string {
  const header = `| Permission | ${PRESET_ROLES.map((role) => role.name).join(" | ")} |`
  const rule = `| --- |${PRESET_ROLES.map(() => " :---: |").join("")}`
  const rows = PERMISSION_GROUPS.flatMap((group) => [
    `| **${group}** |${PRESET_ROLES.map(() => " |").join("")}`,
    ...ALL_PERMISSIONS.filter((permission) => PERMISSIONS[permission].group === group).map(
      (permission) =>
        `| \`${permission}\`${isSensitive(permission) ? " ⚑" : ""} — ${PERMISSIONS[permission].label} | ${PRESET_ROLES.map((role) => (role.permissions.includes(permission) ? "✓" : "")).join(" | ")} |`,
    ),
  ])
  const limits = PRESET_ROLES.map((role) => `| ${role.name} | ${role.refundLimit === null ? "no limit" : role.refundLimit === 0 ? "—" : `Rs. ${(role.refundLimit / 100).toLocaleString("en-US")}`} |`)
  return [
    "# Admin — permissions",
    "",
    "Generated from `server/admin/permissions.ts` (`pnpm admin:docs`); `tests/unit/admin-permissions.test.ts` fails when this file is out of date. ⚑ = sensitive: needs a fresh second factor (step-up, A-003).",
    "",
    "## Role × permission",
    "",
    header,
    rule,
    ...rows,
    "",
    "## Refund ceiling per role",
    "",
    "| Role | Highest single refund |",
    "| --- | --- |",
    ...limits,
    "",
    "Custom roles are created in Staff & roles; they choose any permissions and their own ceiling. System roles cannot be deleted, and Owner cannot be edited.",
    "",
  ].join("\n")
}

/** The registry grouped for the permission matrix (plain data, safe to hand to client components). */
export function permissionCatalog(): { group: string; permissions: { key: string; label: string; sensitive: boolean }[] }[] {
  return PERMISSION_GROUPS.map((group) => ({
    group,
    permissions: ALL_PERMISSIONS.filter((permission) => PERMISSIONS[permission].group === group).map((permission) => ({ key: permission, label: PERMISSIONS[permission].label, sensitive: isSensitive(permission) })),
  })).filter((entry) => entry.permissions.length > 0)
}
