import type { Address } from "@/server/orders/types"
import type { Customer, CustomerAddress, PasswordReset, Session } from "@/server/customers/types"

export type CustomerUpdate = Partial<Pick<Customer, "fullName" | "phone" | "marketingOptIn" | "passwordHash" | "email" | "group">>

/** Staff customer search (admin A4). */
export type CustomerQuery = { q?: string; group?: Customer["group"]; marketing?: boolean; page: number; pageSize: number }

export interface CustomerRepository {
  findByEmail(storeId: string, email: string): Promise<Customer | null>
  findById(id: string): Promise<Customer | null>
  /** Throws conflict when the email is already registered in the store. */
  create(customer: Customer): Promise<Customer>
  update(id: string, changes: CustomerUpdate): Promise<Customer>

  createSession(session: Session): Promise<void>
  findSession(tokenHash: string): Promise<Session | null>
  deleteSession(tokenHash: string): Promise<void>
  deleteSessionsFor(customerId: string): Promise<void>

  createReset(reset: PasswordReset): Promise<void>
  /** Marks an unexpired, unused reset as used and returns it — atomically, so a link works once. */
  consumeReset(tokenHash: string): Promise<PasswordReset | null>

  listAddresses(customerId: string): Promise<CustomerAddress[]>
  saveAddress(customerId: string, address: Address & { id?: string; isDefault: boolean }): Promise<CustomerAddress>
  deleteAddress(customerId: string, addressId: string): Promise<void>

  /** Erases personal data and disables sign-in; the row stays so orders keep a reference. */
  scrub(customerId: string): Promise<void>

  /** Staff search by email, name or phone, newest first; erased accounts are left out. */
  search(storeId: string, query: CustomerQuery): Promise<{ customers: Customer[]; total: number }>
}
