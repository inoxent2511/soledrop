/**
 * Browser → BFF transport. Every call goes to our own `/api/*` routes (never to a vendor);
 * errors arrive as `{ error: { code, message, details } }` and are thrown as ApiError.
 */
export class ApiError extends Error {
  readonly code: string
  readonly status: number
  readonly details?: Record<string, unknown>

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message)
    this.name = "ApiError"
    this.status = status
    this.code = code
    this.details = details
  }

  /** Field-level messages from a 422, keyed by field name. */
  get fields(): Record<string, string[] | undefined> {
    return (this.details?.fields as Record<string, string[] | undefined>) ?? {}
  }
}

type Options = { method?: string; body?: unknown; headers?: Record<string, string>; signal?: AbortSignal; keepalive?: boolean }

export async function request<T>(path: string, options: Options = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, {
      method: options.method ?? "GET",
      headers: { accept: "application/json", ...(options.body !== undefined && { "content-type": "application/json" }), ...options.headers },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      credentials: "same-origin",
      signal: options.signal,
      ...(options.keepalive ? { keepalive: true } : {}),
    })
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error
    throw new ApiError(0, "network", "You seem to be offline. Check your connection and try again.")
  }
  if (response.status === 204) return undefined as T
  const body = (await response.json().catch(() => null)) as ({ error?: { code: string; message: string; details?: Record<string, unknown> } } & T) | null
  if (!response.ok) {
    throw new ApiError(response.status, body?.error?.code ?? "internal", body?.error?.message ?? "Something went wrong. Please try again.", body?.error?.details)
  }
  return body as T
}
