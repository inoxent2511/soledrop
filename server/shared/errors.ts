/** Error codes the API layer maps to HTTP statuses; messages are safe to show to shoppers. */
export type DomainErrorCode =
  | "not_found"
  | "validation"
  | "out_of_stock"
  | "conflict"
  | "unauthorized"
  | "forbidden"
  | "rate_limited"
  | "invalid_transition"
  | "promotion_invalid"
  | "payment_failed"
  | "unavailable"

const STATUS: Record<DomainErrorCode, number> = {
  not_found: 404,
  validation: 422,
  out_of_stock: 409,
  conflict: 409,
  unauthorized: 401,
  forbidden: 403,
  rate_limited: 429,
  invalid_transition: 409,
  promotion_invalid: 422,
  payment_failed: 402,
  unavailable: 503,
}

const DOMAIN_ERROR = Symbol.for("soledrop.domain-error.v1")

/** An expected business failure (as opposed to a bug). */
export class DomainError extends Error {
  readonly code: DomainErrorCode
  readonly details?: Record<string, unknown>

  /** Next's API and RSC graphs can share a pool while loading separate class constructors. */
  static [Symbol.hasInstance](value: unknown): boolean {
    if (this !== DomainError) return Function.prototype[Symbol.hasInstance].call(this, value)
    return value instanceof Error && Reflect.get(value, DOMAIN_ERROR) === true
  }

  constructor(code: DomainErrorCode, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "DomainError"
    this.code = code
    this.details = details
    Object.defineProperty(this, DOMAIN_ERROR, { value: true })
  }

  get status() {
    return STATUS[this.code]
  }
}

export function isDomainError(error: unknown): error is DomainError {
  return error instanceof DomainError
}
