import "server-only"

import { serverEnv } from "@/lib/env.server"
import { createBankTransferProvider } from "@/server/adapters/payments/bank-transfer"
import { createCashOnDeliveryProvider } from "@/server/adapters/payments/cod"
import { createStripeProvider } from "@/server/adapters/payments/stripe"
import type { PaymentProvider } from "@/server/adapters/payments/types"
import { flags } from "@/server/platform/flags"

/** Provider registry: checkout offers every available provider, in this order. */
const registry: PaymentProvider[] = [
  createCashOnDeliveryProvider(),
  createBankTransferProvider({
    details:
      serverEnv.BANK_NAME && serverEnv.BANK_ACCOUNT_TITLE && serverEnv.BANK_IBAN
        ? { bank: serverEnv.BANK_NAME, accountTitle: serverEnv.BANK_ACCOUNT_TITLE, iban: serverEnv.BANK_IBAN }
        : null,
    production: serverEnv.NODE_ENV === "production",
    enabled: () => flags().isEnabled("bank-transfer-payments"),
  }),
  createStripeProvider({
    secretKey: serverEnv.STRIPE_SECRET_KEY,
    webhookSecret: serverEnv.STRIPE_WEBHOOK_SECRET,
    enabled: () => flags().isEnabled("stripe-payments"),
  }),
]

export function paymentProvider(code: string): PaymentProvider | undefined {
  return registry.find((provider) => provider.code === code)
}

export async function availablePaymentProviders() {
  const checks = await Promise.all(registry.map(async (provider) => ((await provider.isAvailable()) ? provider : null)))
  return checks.filter((provider): provider is PaymentProvider => provider !== null)
}

export type { PaymentNextStep, PaymentProvider } from "@/server/adapters/payments/types"
