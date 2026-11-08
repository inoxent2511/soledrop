import "server-only"
import { mysqlPolicy } from "@/server/db/policy.repository"

import { and, asc, eq, inArray } from "drizzle-orm"
import type { ShippingOperations } from "./repository"
import type { ShippingZone } from "./types"
import { type ActorScoped, requireGrant, requireStore } from "@/server/db/actor"
import { database, withTransaction } from "@/server/db/client"
import { shippingRates, shippingZoneCities, shippingZoneCountries, shippingZones, taxRates } from "@/server/db/schema"
import { uuidv7 } from "@/server/db/uuid"
import { DomainError } from "@/server/shared/errors"

export function createMysqlShippingRepository(): ActorScoped<ShippingOperations> {
  return mysqlPolicy<ShippingOperations>({
    async listZones(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const zones = await db.select().from(shippingZones).where(eq(shippingZones.storeId, actor.storeId)).orderBy(asc(shippingZones.position))
      if (!zones.length) return []
      const ids = zones.map((zone) => zone.id)
      const [rates, countries, cities] = await Promise.all([
        db.select().from(shippingRates).where(inArray(shippingRates.zoneId, ids)).orderBy(asc(shippingRates.id)),
        db.select().from(shippingZoneCountries).where(inArray(shippingZoneCountries.id, ids)).orderBy(asc(shippingZoneCountries.position)),
        db.select().from(shippingZoneCities).where(inArray(shippingZoneCities.id, ids)).orderBy(asc(shippingZoneCities.position)),
      ])
      return zones.map((zone): ShippingZone => ({ id: zone.id, name: zone.name, position: zone.position, countries: countries.filter((row) => row.id === zone.id).map((row) => row.value), cities: cities.filter((row) => row.id === zone.id).map((row) => row.value), rates: rates.filter((row) => row.zoneId === zone.id).map((row) => ({ code: row.code, label: row.label, amount: row.amount, freeOver: row.freeOver, minDays: row.minDays, maxDays: row.maxDays, cashOnDelivery: row.cashOnDelivery === 1 })) }))
    },
    async listTaxRates(actor, storeId) {
      requireStore(actor, storeId)
      const db = await database()
      const rows = await db.select().from(taxRates).where(eq(taxRates.storeId, actor.storeId)).orderBy(asc(taxRates.id))
      return rows.map((row) => ({ country: row.country, province: row.province, label: row.label, basisPoints: row.basisPoints, inclusive: row.inclusive === 1 }))
    },
    async saveZone(actor, storeId, zone) {
      requireStore(actor, storeId); requireGrant(actor, "shipping:write")
      return withTransaction(async (db) => {
        const where = and(eq(shippingZones.id, zone.id), eq(shippingZones.storeId, actor.storeId))
        const [existing] = await db.select().from(shippingZones).where(where).for("update")
        const changes = { name: zone.name, position: zone.position }
        if (existing) await db.update(shippingZones).set(changes).where(where)
        else await db.insert(shippingZones).values({ id: zone.id, storeId, ...changes })
        await db.delete(shippingRates).where(eq(shippingRates.zoneId, zone.id))
        await db.delete(shippingZoneCountries).where(eq(shippingZoneCountries.id, zone.id))
        await db.delete(shippingZoneCities).where(eq(shippingZoneCities.id, zone.id))
        if (zone.rates.length) await db.insert(shippingRates).values(zone.rates.map((rate) => ({ ...rate, cashOnDelivery: rate.cashOnDelivery ? 1 : 0, id: uuidv7(), zoneId: zone.id })))
        if (zone.countries.length) await db.insert(shippingZoneCountries).values(zone.countries.map((value, position) => ({ id: zone.id, value, position })))
        if (zone.cities.length) await db.insert(shippingZoneCities).values(zone.cities.map((value, position) => ({ id: zone.id, value, position })))
        return structuredClone(zone)
      })
    },
    async deleteZone(actor, storeId, id) {
      requireStore(actor, storeId); requireGrant(actor, "shipping:write")
      const db = await database()
      const [result] = await db.delete(shippingZones).where(and(eq(shippingZones.id, id), eq(shippingZones.storeId, actor.storeId)))
      if (!result.affectedRows) throw new DomainError("not_found", "Shipping zone not found.")
    },
    async replaceTaxRates(actor, storeId, rates) {
      requireStore(actor, storeId); requireGrant(actor, "shipping:write")
      return withTransaction(async (db) => {
        // The store row serializes whole-table replacement, including an initially empty table.
        const { stores } = await import("@/server/db/schema")
        await db.select({ id: stores.id }).from(stores).where(eq(stores.id, actor.storeId)).for("update")
        await db.delete(taxRates).where(eq(taxRates.storeId, actor.storeId))
        if (rates.length) await db.insert(taxRates).values(rates.map((rate) => ({ ...rate, id: uuidv7(), storeId, inclusive: rate.inclusive ? 1 : 0 })))
        return structuredClone(rates)
      })
    },
  })
}
