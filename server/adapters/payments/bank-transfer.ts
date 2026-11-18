import "server-only"

import type { PaymentProvider } from "@/server/adapters/payments/types"

export type BankDetails = { bank: string; accountTitle: string; iban: string }

/** Shown in development and tests only, so the bank-transfer journey can be exercised locally. */
const SAMPLE_DETAILS: BankDetails = { bank: "Sample Bank (development only)", accountTitle: "SOLE DROP", iban: "PK00 SAMP 0000 0000 0000 0000" }

/**
 * Bank transfer: the order waits in pending_payment until staff confirm the transfer
 * (record_payment). In production the option is offered only once BANK_NAME, BANK_ACCOUNT_TITLE
 * and BANK_IBAN are set, so a shopper is never shown an account that does not exist.
 */
export function createBankTransferProvider(options: { details: BankDetails | null; production: boolean; enabled: () => Promise<boolean> }): PaymentProvider {
  const details = options.details ?? (options.production ? null : SAMPLE_DETAILS)
  return {
    code: "bank_transfer",
    label: "Bank transfer",
    description: "Transfer the total to our bank account; we ship once it arrives.",
    async isAvailable() {
      return details !== null && (await options.enabled())
    },
    async createPayment(input) {
      if (!details) throw new Error("Bank transfer is not configured.")
      return {
        status: "pending",
        providerRef: null,
        next: {
          type: "instructions",
          title: "Complete your bank transfer",
          lines: [
            { label: "Bank", value: details.bank },
            { label: "Account title", value: details.accountTitle },
            { label: "IBAN", value: details.iban },
            { label: "Reference", value: input.orderNumber },
            { label: "Amount", value: `Rs. ${(input.amount / 100).toLocaleString("en-PK")}` },
          ],
        },
      }
    },
  }
}
