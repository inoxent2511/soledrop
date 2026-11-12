# Events (transactional outbox)

Domain changes write an `outbox_events` row **in the same transaction** as the change. For orders,
that is inside the `place_order`, `transition_order`, `record_payment`, `create_refund` and
`create_return` database functions, so an event exists if and only if the change committed.
`POST /api/jobs/outbox` (every minute) claims due events with `FOR UPDATE SKIP LOCKED`, so several
workers never take the same event. For each event it sends the customer email (`server/adapters/email`),
then posts signed webhooks. A failure retries after 30 s × 2^attempts and gives up after 8 attempts
(status `failed`, `last_error` kept). Nothing a shopper waits on calls a vendor.

## Topics

| Topic | Emitted by | Payload (besides `orderId`/`number` where relevant) | Email delivery |
| --- | --- | --- | --- |
| `order.placed` | `place_order` | `email, total, currency, paymentMethod` | Order confirmation, with an order link |
| `order.status_changed` | `transition_order`; `record_payment` when it confirms a pending order | `email, from, to, trackingNumber` | Status update (shipped includes tracking) |
| `payment.recorded` | `record_payment` | `provider, status, amount` | — |
| `refund.created` | `create_refund` | `email, amount` | Refund notice |
| `return.requested` | `create_return` | `email, returnId` | — |
| `customer.registered` | customer service | `customerId, email, fullName` | Welcome |
| `password.reset_requested` | customer service | `customerId, email, token` | Reset link |
| `newsletter.subscribed` | content service | `email, token` | Confirmation with an unsubscribe link |
| `contact.received` | content service | `id, name, email, orderNumber` | Notification to support; full message stays in the private admin inbox |

Amounts are integers in paisa. `EventTopic` in `server/platform/types.ts` is the source of truth.

## Outbound webhooks

Configure `WEBHOOK_ENDPOINTS="https://erp.example/hooks|<secret>|order.placed+refund.created"`
(`*` for every topic; separate several endpoints with commas).

```http
POST <url>
content-type: application/json
x-soledrop-event: order.placed
x-soledrop-delivery: <event id>        ← use it to de-duplicate (delivery is at-least-once)
x-soledrop-timestamp: <unix seconds>
x-soledrop-signature: hex(HMAC-SHA256(secret, "<timestamp>.<raw body>"))

{ "id": "…", "topic": "order.placed", "createdAt": "…", "data": { … } }
```

Receivers should verify the signature with a constant-time compare and reject timestamps older than
5 minutes. Bearer secrets used in customer emails (`accessToken`, `token`) are stripped from webhook
payloads. Each attempt is recorded in `webhook_deliveries` with the response status. Any non-2xx
response (or a 10 s timeout) retries the whole event, so endpoints must be idempotent.

## Email

`EMAIL_PROVIDER=console` (default) logs the rendered email instead of sending it. `resend` sends
through Resend's HTTP API. Templates (`server/adapters/email/templates.ts`) take their colours from
`design-tokens.json` and the address from `lib/site.ts`.
