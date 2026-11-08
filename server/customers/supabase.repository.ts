import "server-only"

import type { CustomerOperations } from "@/server/customers/repository"
import type { Customer, CustomerAddress, PasswordReset, Session } from "@/server/customers/types"
import { searchTerm, supabase, unwrap } from "@/server/db/supabase"
import { DomainError } from "@/server/shared/errors"

type CustomerRecord = {
  id: string
  store_id: string
  email: string
  password_hash: string
  full_name: string
  phone: string | null
  customer_group: Customer["group"]
  marketing_opt_in: boolean
  created_at: string
  deletion_requested_at: string | null
}

const toCustomer = (row: CustomerRecord): Customer => ({
  id: row.id,
  storeId: row.store_id,
  email: row.email,
  passwordHash: row.password_hash,
  fullName: row.full_name,
  phone: row.phone,
  group: row.customer_group,
  marketingOptIn: row.marketing_opt_in,
  createdAt: row.created_at,
  deletionRequestedAt: row.deletion_requested_at,
})

type AddressRecord = {
  id: string
  customer_id: string
  full_name: string
  phone: string
  line1: string
  line2: string | null
  city: string
  province: string
  postal_code: string | null
  country: string
  is_default: boolean
}

const toAddress = (row: AddressRecord): CustomerAddress => ({
  id: row.id,
  customerId: row.customer_id,
  fullName: row.full_name,
  phone: row.phone,
  line1: row.line1,
  line2: row.line2 ?? undefined,
  city: row.city,
  province: row.province,
  postalCode: row.postal_code ?? undefined,
  country: row.country,
  isDefault: row.is_default,
})

export function createSupabaseCustomerRepository(): CustomerOperations {
  const one = async (column: string, value: string, storeId?: string) => {
    let query = supabase().from("customers").select("*").eq(column, value)
    if (storeId) query = query.eq("store_id", storeId)
    const row = unwrap(await query.maybeSingle()) as CustomerRecord | null
    return row ? toCustomer(row) : null
  }

  return {
    findByEmail: (storeId, email) => one("email", email.toLowerCase(), storeId),
    findById: (id) => one("id", id),
    async create(customer) {
      const row = unwrap(
        await supabase()
          .from("customers")
          .insert({
            id: customer.id,
            store_id: customer.storeId,
            email: customer.email,
            password_hash: customer.passwordHash,
            full_name: customer.fullName,
            phone: customer.phone,
            customer_group: customer.group,
            marketing_opt_in: customer.marketingOptIn,
          })
          .select("*")
          .single(),
      ) as CustomerRecord
      return toCustomer(row)
    },
    async update(id, changes) {
      const row = unwrap(
        await supabase()
          .from("customers")
          .update({
            ...(changes.email !== undefined && { email: changes.email }),
            ...(changes.fullName !== undefined && { full_name: changes.fullName }),
            ...(changes.phone !== undefined && { phone: changes.phone }),
            ...(changes.marketingOptIn !== undefined && { marketing_opt_in: changes.marketingOptIn }),
            ...(changes.passwordHash !== undefined && { password_hash: changes.passwordHash }),
            ...(changes.group !== undefined && { customer_group: changes.group }),
          })
          .eq("id", id)
          .select("*")
          .maybeSingle(),
      ) as CustomerRecord | null
      if (!row) throw new DomainError("not_found", "Account not found.")
      return toCustomer(row)
    },

    async createSession(session: Session) {
      unwrap(await supabase().from("sessions").insert({ token_hash: session.tokenHash, customer_id: session.customerId, expires_at: session.expiresAt }))
    },
    async findSession(tokenHash) {
      const row = unwrap(
        await supabase().from("sessions").select("token_hash, customer_id, created_at, expires_at").eq("token_hash", tokenHash).gt("expires_at", new Date().toISOString()).maybeSingle(),
      ) as { token_hash: string; customer_id: string; created_at: string; expires_at: string } | null
      return row ? { tokenHash: row.token_hash, customerId: row.customer_id, createdAt: row.created_at, expiresAt: row.expires_at } : null
    },
    async deleteSession(tokenHash) {
      unwrap(await supabase().from("sessions").delete().eq("token_hash", tokenHash))
    },
    async deleteSessionsFor(customerId) {
      unwrap(await supabase().from("sessions").delete().eq("customer_id", customerId))
    },

    async createReset(reset: PasswordReset) {
      unwrap(await supabase().from("password_resets").insert({ token_hash: reset.tokenHash, customer_id: reset.customerId, expires_at: reset.expiresAt }))
    },
    async consumeReset(tokenHash) {
      const row = unwrap(
        await supabase()
          .from("password_resets")
          .update({ used_at: new Date().toISOString() })
          .eq("token_hash", tokenHash)
          .is("used_at", null)
          .gt("expires_at", new Date().toISOString())
          .select("token_hash, customer_id, expires_at, used_at")
          .maybeSingle(),
      ) as { token_hash: string; customer_id: string; expires_at: string; used_at: string } | null
      return row ? { tokenHash: row.token_hash, customerId: row.customer_id, expiresAt: row.expires_at, usedAt: row.used_at } : null
    },

    async listAddresses(customerId) {
      const rows = unwrap(await supabase().from("addresses").select("*").eq("customer_id", customerId).order("is_default", { ascending: false })) as AddressRecord[]
      return rows.map(toAddress)
    },
    async saveAddress(customerId, address) {
      const row = unwrap(
        await supabase().rpc("save_address", {
          p_customer_id: customerId,
          p_address: {
            id: address.id ?? null,
            full_name: address.fullName,
            phone: address.phone,
            line1: address.line1,
            line2: address.line2 ?? null,
            city: address.city,
            province: address.province,
            postal_code: address.postalCode ?? null,
            country: address.country,
            is_default: address.isDefault,
          },
        }),
      ) as AddressRecord
      return toAddress(row)
    },
    async deleteAddress(customerId, addressId) {
      unwrap(await supabase().rpc("delete_address", { p_customer_id: customerId, p_address_id: addressId }))
    },
    async scrub(customerId) {
      unwrap(await supabase().rpc("scrub_customer", { p_customer_id: customerId }))
    },
    async search(storeId, query) {
      let request = supabase().from("customers").select("*", { count: "exact" }).eq("store_id", storeId).not("email", "like", "%@invalid")
      const term = query.q ? searchTerm(query.q) : ""
      if (term) request = request.or(`email.ilike.*${term}*,full_name.ilike.*${term}*,phone.ilike.*${term}*`)
      if (query.group) request = request.eq("customer_group", query.group)
      if (query.marketing !== undefined) request = request.eq("marketing_opt_in", query.marketing)
      const start = (query.page - 1) * query.pageSize
      const result = await request.order("created_at", { ascending: false }).range(start, start + query.pageSize - 1)
      const rows = unwrap(result) as CustomerRecord[]
      return { customers: rows.map(toCustomer), total: result.count ?? rows.length }
    },
  }
}
