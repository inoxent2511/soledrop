import { z } from "zod"

/** Shipping zones, rates and the tax table (admin A5). Money in minor units, tax in basis points (17% = 1700). */
export const rateInput = z
  .object({
    code: z.string().trim().min(2).max(32).regex(/^[a-z0-9_-]+$/, "Lowercase letters, numbers, dashes"),
    label: z.string().trim().min(2).max(60),
    amount: z.number().int().min(0).max(10_000_000),
    freeOver: z.number().int().positive().nullable(),
    minDays: z.number().int().min(0).max(60),
    maxDays: z.number().int().min(0).max(90),
    cashOnDelivery: z.boolean(),
  })
  .refine((rate) => rate.maxDays >= rate.minDays, { message: "The slowest delivery can't be faster than the quickest", path: ["maxDays"] })

export const zoneInput = z
  .object({
    name: z.string().trim().min(2).max(60),
    countries: z.array(z.string().regex(/^[A-Z]{2}$/)).min(1).max(50),
    cities: z.array(z.string().trim().min(2).max(60)).max(200).default([]),
    position: z.number().int().min(0).max(1000).default(0),
    rates: z.array(rateInput).min(1, "Add at least one delivery option").max(10),
  })
  .refine((zone) => new Set(zone.rates.map((rate) => rate.code)).size === zone.rates.length, { message: "Each delivery option needs its own code", path: ["rates"] })

export const taxRateInput = z.object({
  country: z.string().regex(/^[A-Z]{2}$/),
  province: z.string().trim().min(2).max(60).nullable(),
  label: z.string().trim().min(2).max(60),
  basisPoints: z.number().int().min(0).max(10_000),
  inclusive: z.boolean(),
})

export const taxTableInput = z
  .object({ rates: z.array(taxRateInput).max(50) })
  .refine((table) => new Set(table.rates.map((rate) => `${rate.country}:${rate.province ?? "*"}`)).size === table.rates.length, { message: "Each country and province can have one rate", path: ["rates"] })

export type ZoneInput = z.infer<typeof zoneInput>
export type TaxRateInput = z.infer<typeof taxRateInput>
