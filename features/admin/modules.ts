import {
  BarChart3,
  Boxes,
  CreditCard,
  FileText,
  FolderTree,
  Image,
  Inbox,
  LayoutDashboard,
  Megaphone,
  Package,
  Receipt,
  Star,
  ScrollText,
  Search,
  Settings,
  ShieldCheck,
  Tag,
  Truck,
  Users,
  type LucideIcon,
} from "lucide-react"

import type { Permission } from "@/server/admin/permissions"

/**
 * The admin module registry (admin-ia.md): one entry per module drives the sidebar, the command
 * palette and the no-access page. A module shows only to staff holding its `permission`; each of
 * its pages and handlers checks again on the server (server/admin/dal.ts).
 */
export type AdminModule = {
  key: string
  label: string
  href: string
  group: "Overview" | "Sales" | "Catalogue" | "Marketing" | "Content" | "Money" | "Setup"
  permission: Permission
  icon: LucideIcon
  /** Words the command palette also matches. */
  keywords?: string[]
}

export const ADMIN_MODULES: readonly AdminModule[] = [
  { key: "dashboard", label: "Dashboard", href: "/admin", group: "Overview", permission: "dashboard:read", icon: LayoutDashboard, keywords: ["home", "today"] },
  { key: "orders", label: "Orders", href: "/admin/orders", group: "Sales", permission: "orders:read", icon: Receipt, keywords: ["fulfil", "refund", "returns"] },
  { key: "customers", label: "Customers", href: "/admin/customers", group: "Sales", permission: "customers:read", icon: Users },
  { key: "messages", label: "Contact messages", href: "/admin/messages", group: "Sales", permission: "customers:read_pii", icon: Inbox, keywords: ["contact", "complaints", "support", "inbox"] },
  { key: "products", label: "Products", href: "/admin/products", group: "Catalogue", permission: "products:read", icon: Package, keywords: ["shoes", "variants"] },
  { key: "brands", label: "Brands", href: "/admin/brands", group: "Catalogue", permission: "products:read", icon: Tag, keywords: ["product brands", "remove brand"] },
  { key: "collections", label: "Collections", href: "/admin/collections", group: "Catalogue", permission: "collections:read", icon: FolderTree },
  { key: "inventory", label: "Inventory", href: "/admin/inventory", group: "Catalogue", permission: "inventory:read", icon: Boxes, keywords: ["stock"] },
  { key: "promotions", label: "Promotions", href: "/admin/promotions", group: "Marketing", permission: "promotions:read", icon: Tag, keywords: ["discount", "codes", "sale"] },
  { key: "marketing", label: "Marketing", href: "/admin/marketing", group: "Marketing", permission: "marketing:read", icon: Megaphone, keywords: ["newsletter", "abandoned carts"] },
  { key: "search", label: "Search", href: "/admin/search", group: "Marketing", permission: "search:read", icon: Search, keywords: ["synonyms", "queries"] },
  { key: "content", label: "Pages & FAQs", href: "/admin/content", group: "Content", permission: "content:read", icon: FileText, keywords: ["policy", "terms", "faq"] },
  { key: "reviews", label: "Customer reviews", href: "/admin/reviews", group: "Content", permission: "reviews:read", icon: Star, keywords: ["ratings", "feedback", "moderation"] },
  { key: "banners", label: "Banners & images", href: "/admin/banners", group: "Content", permission: "content:read", icon: Image, keywords: ["homepage", "hero", "slides", "category", "banner", "instagram"] },
  { key: "media", label: "Media", href: "/admin/media", group: "Content", permission: "media:read", icon: Image, keywords: ["photos", "images"] },
  { key: "payments", label: "Payments", href: "/admin/payments", group: "Money", permission: "payments:read", icon: CreditCard, keywords: ["bank transfer", "reconcile"] },
  { key: "reports", label: "Reports", href: "/admin/reports", group: "Money", permission: "reports:read", icon: BarChart3, keywords: ["sales", "analytics"] },
  { key: "shipping", label: "Shipping & tax", href: "/admin/shipping", group: "Setup", permission: "shipping:read", icon: Truck, keywords: ["zones", "rates", "tax"] },
  { key: "settings", label: "Settings", href: "/admin/settings", group: "Setup", permission: "settings:read", icon: Settings, keywords: ["flags", "webhooks", "api keys", "jobs"] },
  { key: "staff", label: "Staff & roles", href: "/admin/staff", group: "Setup", permission: "staff:read", icon: ShieldCheck, keywords: ["team", "permissions", "invite"] },
  { key: "audit", label: "Audit log", href: "/admin/audit", group: "Setup", permission: "audit:read", icon: ScrollText, keywords: ["history", "who changed"] },
]

export const visibleModules = (permissions: readonly string[]) => ADMIN_MODULES.filter((module) => permissions.includes(module.permission))

/** The module a path belongs to (longest matching href). */
export function moduleFor(pathname: string): AdminModule | undefined {
  return [...ADMIN_MODULES].sort((a, b) => b.href.length - a.href.length).find((module) => (module.href === "/admin" ? pathname === "/admin" : pathname === module.href || pathname.startsWith(`${module.href}/`)))
}
