import "server-only"
import { fixturePolicy } from "@/server/db/fixtures-policy.repository"
import { shippingGuards } from "@/server/db/fixture-guards.repository"

import { db, transaction } from "@/server/fixtures/store"
import { DomainError } from "@/server/shared/errors"
import type { ShippingOperations, ShippingRepository } from "@/server/shipping/repository"

export function createFixturesShippingRepository(): ShippingRepository {
  const operations: ShippingOperations = {
    async listZones() {
      return db().shippingZones
    },
    async listTaxRates() {
      return db().taxRates
    },
    async saveZone(_storeId, zone) {
      return transaction((tables) => {
        const index = tables.shippingZones.findIndex((row) => row.id === zone.id)
        if (index === -1) tables.shippingZones.push(structuredClone(zone))
        else tables.shippingZones[index] = structuredClone(zone)
        return structuredClone(zone)
      })
    },
    async deleteZone(_storeId, id) {
      transaction((tables) => {
        if (!tables.shippingZones.some((row) => row.id === id)) throw new DomainError("not_found", "Zone not found.")
        tables.shippingZones = tables.shippingZones.filter((row) => row.id !== id)
      })
    },
    async replaceTaxRates(_storeId, rates) {
      return transaction((tables) => {
        tables.taxRates = structuredClone(rates)
        return structuredClone(rates)
      })
    },
  }
  return fixturePolicy<ShippingOperations>(operations, shippingGuards)
}
