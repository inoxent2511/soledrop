/** Quotas and another worker's lease defer work without burning its failure budget. */
export class DeliveryDeferred extends Error {
  readonly retryAt: string
  constructor(retryAt: string) { super("Delivery deferred until capacity is available."); this.retryAt = retryAt }
}
