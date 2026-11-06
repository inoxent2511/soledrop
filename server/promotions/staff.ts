import "server-only"

import { randomBytes } from "node:crypto"

import type { PromotionInput, SimulationInput } from "@/features/admin/promotions/schema"
import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import { evaluatePromotions } from "@/server/promotions/evaluate"
import type { PromotionRepository } from "@/server/promotions/repository"
import type { Promotion } from "@/server/promotions/types"
import { DomainError } from "@/server/shared/errors"
import { newId } from "@/server/shared/ids"

/**
 * Staff promotions (admin A5): build, schedule, simulate with the real engine (server/promotions/
 * evaluate.ts, the same code checkout runs), see redemptions. Used promotions are switched off,
 * never deleted, so order history keeps its discounts' source.
 */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

type Deps = { promotions: PromotionRepository; orderNumber: (orderId: string) => Promise<string | null>; audit: Audit; revalidate: () => void }

export type PromotionState = "live" | "scheduled" | "ended" | "off" | "used_up"

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

export function promotionState(promotion: Promotion, at = Date.now()): PromotionState {
  if (!promotion.active) return "off"
  if (promotion.usageLimit !== null && promotion.timesUsed >= promotion.usageLimit) return "used_up"
  if (promotion.endsAt && Date.parse(promotion.endsAt) <= at) return "ended"
  if (promotion.startsAt && Date.parse(promotion.startsAt) > at) return "scheduled"
  return "live"
}

/** An easy-to-read code: no 0/O or 1/I. */
export function generateCode(prefix = "SD") {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"
  const bytes = randomBytes(8)
  const body = [...bytes].map((byte) => alphabet[byte % alphabet.length]).join("")
  return `${prefix}-${body.slice(0, 4)}-${body.slice(4)}`
}

export function createStaffPromotions(deps: Deps) {
  const { promotions } = deps

  async function load(staff: StaffContext, id: string) {
    const promotion = await promotions.find(staff.member.storeId, id)
    if (!promotion) throw new DomainError("not_found", "Promotion not found.")
    return promotion
  }

  return {
    async list(staff: StaffContext) {
      need(staff, "promotions:read")
      const all = await promotions.listAll(staff.member.storeId)
      return all.map((promotion) => ({ ...promotion, state: promotionState(promotion) })).sort((a, b) => a.state.localeCompare(b.state) || a.title.localeCompare(b.title))
    },

    async detail(staff: StaffContext, id: string) {
      need(staff, "promotions:read")
      const promotion = await load(staff, id)
      const redemptions = await promotions.redemptions(id, 100)
      const canSeeOrders = staff.permissions.includes("orders:read")
      return {
        promotion: { ...promotion, state: promotionState(promotion) },
        redemptions: await Promise.all(redemptions.map(async (row) => ({ at: row.at, email: staff.permissions.includes("customers:read_pii") ? row.email : `${row.email.slice(0, 1)}•••@${row.email.split("@")[1] ?? ""}`, order: canSeeOrders ? await deps.orderNumber(row.orderId) : null }))),
      }
    },

    async save(staff: StaffContext, meta: RequestMeta, input: PromotionInput, id?: string) {
      need(staff, "promotions:write")
      const before = id ? await load(staff, id) : null
      const promotion: Promotion = { id: before?.id ?? newId(), storeId: staff.member.storeId, timesUsed: before?.timesUsed ?? 0, ...input }
      if (before && input.usageLimit !== null && input.usageLimit < before.timesUsed) {
        throw new DomainError("validation", `It has already been used ${before.timesUsed} times, so the limit can't be lower.`)
      }
      const saved = await promotions.save(promotion)
      await deps.audit(staff, meta, {
        action: before ? "promotion.updated" : "promotion.created",
        entity: "promotion",
        entityId: saved.id,
        before: before ? { title: before.title, code: before.code, conditions: before.conditions, actions: before.actions, startsAt: before.startsAt, endsAt: before.endsAt, usageLimit: before.usageLimit, active: before.active } : undefined,
        after: { title: saved.title, code: saved.code, conditions: saved.conditions, actions: saved.actions, startsAt: saved.startsAt, endsAt: saved.endsAt, usageLimit: saved.usageLimit, active: saved.active },
        storeId: staff.member.storeId,
      })
      deps.revalidate()
      return saved
    },

    async setActive(staff: StaffContext, meta: RequestMeta, id: string, active: boolean) {
      need(staff, "promotions:write")
      const before = await load(staff, id)
      const saved = await promotions.save({ ...before, active })
      await deps.audit(staff, meta, { action: active ? "promotion.switched_on" : "promotion.switched_off", entity: "promotion", entityId: id, before: { active: before.active }, after: { active }, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async remove(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "promotions:write")
      const before = await load(staff, id)
      await promotions.remove(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "promotion.deleted", entity: "promotion", entityId: id, before: { title: before.title, code: before.code }, storeId: staff.member.storeId })
    },

    /** Runs a promotion (saved or a draft from the form) against a test basket, with the checkout engine. */
    simulate(staff: StaffContext, draft: PromotionInput & { id?: string; timesUsed?: number }, basket: SimulationInput) {
      need(staff, "promotions:read")
      const promotion: Promotion = { id: draft.id ?? "simulation", storeId: staff.member.storeId, timesUsed: draft.timesUsed ?? 0, ...draft }
      const lines = basket.lines.map((line, index) => ({ lineId: `line-${index}`, kind: line.kind, collections: line.collections, quantity: line.quantity, lineTotal: line.unitPrice * line.quantity }))
      const subtotal = lines.reduce((sum, line) => sum + line.lineTotal, 0)
      const { applied, rejected } = evaluatePromotions([promotion], promotion.code ? [basket.code || promotion.code] : [], {
        lines,
        subtotal,
        customerGroup: basket.customerGroup,
        previousOrders: basket.previousOrders,
        redemptionsByPromotion: new Map(),
        at: new Date(),
      })
      const result = applied[0]
      return {
        subtotal,
        discount: result?.amount ?? 0,
        freeShipping: result?.freeShipping ?? false,
        total: subtotal - (result?.amount ?? 0),
        applies: Boolean(result),
        reason: result ? null : (rejected[0]?.reason ?? "The basket doesn't meet the conditions."),
      }
    },

    generateCode,
  }
}

export type StaffPromotions = ReturnType<typeof createStaffPromotions>
