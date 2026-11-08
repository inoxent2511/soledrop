import "server-only"

import { siteConfig } from "@/lib/site"
import { serverSiteUrl } from "@/lib/site-server"
import { ORDER_STATUSES } from "@/server/orders/types"

const error = { $ref: "#/components/responses/Error" }
const json = (schema: object) => ({ content: { "application/json": { schema } } })
const numberParam = { name: "number", in: "path", required: true, schema: { type: "string", example: "SD10001" } }

/** OpenAPI 3.1 description of /api/v1, served at /api/v1/openapi.json. Kept beside the routes it documents. */
export function openApiDocument() {
  return {
    openapi: "3.1.0",
    info: {
      title: `${siteConfig.name} headless API`,
      version: "1.0.0",
      description: "Catalogue, order operations and product import/export. Authenticate with `Authorization: Bearer <key>`; keys carry `read` and/or `write` scopes. Amounts are integer minor units (paisa).",
    },
    servers: [{ url: `${serverSiteUrl()}/api/v1` }],
    security: [{ apiKey: [] }],
    components: {
      securitySchemes: { apiKey: { type: "http", scheme: "bearer" } },
      responses: {
        Error: json({
          type: "object",
          required: ["error"],
          properties: { error: { type: "object", required: ["code", "message"], properties: { code: { type: "string" }, message: { type: "string" }, details: { type: "object" } } } },
        }),
      },
      schemas: {
        Money: { type: "integer", description: "Minor units (1 PKR = 100)" },
        Product: {
          type: "object",
          properties: {
            id: { type: "string", format: "uuid" },
            slug: { type: "string" },
            title: { type: "string" },
            kind: { enum: ["new", "preloved"] },
            gender: { enum: ["men", "women", "kids", "unisex"] },
            condition: { type: ["string", "null"] },
            price: { type: "object", properties: { amount: { $ref: "#/components/schemas/Money" }, compareAt: { type: ["integer", "null"] }, currency: { type: "string" } } },
            inStock: { type: "boolean" },
            variants: { type: "array", items: { type: "object", properties: { id: { type: "string" }, sku: { type: "string" }, size: { type: "object" } } } },
          },
        },
        Order: {
          type: "object",
          properties: {
            number: { type: "string" },
            status: { enum: ORDER_STATUSES },
            paymentStatus: { type: "string" },
            total: { $ref: "#/components/schemas/Money" },
            lines: { type: "array", items: { type: "object" } },
            history: { type: "array", items: { type: "object" } },
          },
        },
      },
    },
    paths: {
      "/products": {
        get: {
          summary: "List products",
          parameters: ["collection", "kind", "gender", "size", "brand", "min", "max", "condition", "sort", "page", "pageSize", "q", "customerGroup"].map((name) => ({ name, in: "query", schema: { type: "string" } })),
          responses: { 200: json({ type: "object", properties: { items: { type: "array", items: { $ref: "#/components/schemas/Product" } }, total: { type: "integer" }, page: { type: "integer" }, pageCount: { type: "integer" }, facets: { type: "object" } } }), 401: error },
        },
      },
      "/products/{slug}": {
        get: { summary: "Get a product", parameters: [{ name: "slug", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json({ type: "object", properties: { product: { $ref: "#/components/schemas/Product" } } }), 404: error } },
      },
      "/products/export": { get: { summary: "Export products as CSV", responses: { 200: { content: { "text/csv": { schema: { type: "string" } } } } } } },
      "/products/import": {
        post: {
          summary: "Import products from CSV (write scope)",
          parameters: [{ name: "dryRun", in: "query", schema: { enum: ["1"] } }],
          requestBody: { required: true, content: { "text/csv": { schema: { type: "string" } } } },
          responses: { 200: json({ type: "object" }), 422: json({ type: "object" }) },
        },
      },
      "/collections": { get: { summary: "List collections", responses: { 200: json({ type: "object" }) } } },
      "/orders/{number}": { get: { summary: "Get an order with payments and returns", parameters: [numberParam], responses: { 200: json({ type: "object", properties: { order: { $ref: "#/components/schemas/Order" } } }), 404: error } } },
      "/orders/{number}/transition": {
        post: {
          summary: "Change order status (write scope)",
          parameters: [numberParam],
          requestBody: json({ type: "object", required: ["to"], properties: { to: { enum: ORDER_STATUSES }, note: { type: "string" }, trackingNumber: { type: "string" } } }),
          responses: { 200: json({ type: "object" }), 409: error },
        },
      },
      "/orders/{number}/payments": {
        post: {
          summary: "Record an offline payment (write scope)",
          parameters: [numberParam],
          requestBody: json({ type: "object", required: ["provider", "amount", "idempotencyKey"], properties: { provider: { enum: ["cod", "bank_transfer"] }, amount: { type: "integer" }, reference: { type: "string" }, idempotencyKey: { type: "string" } } }),
          responses: { 201: json({ type: "object" }) },
        },
      },
      "/orders/{number}/refunds": {
        post: {
          summary: "Refund an order (write scope)",
          parameters: [numberParam],
          requestBody: json({ type: "object", required: ["amount", "reason", "idempotencyKey"], properties: { amount: { type: "integer" }, reason: { type: "string" }, lines: { type: "array" }, restock: { type: "boolean" }, idempotencyKey: { type: "string" } } }),
          responses: { 201: json({ type: "object" }), 422: error },
        },
      },
      "/returns/{id}/receive": { post: { summary: "Mark a return received and restock it (write scope)", parameters: [{ name: "id", in: "path", required: true, schema: { type: "string" } }], responses: { 200: json({ type: "object" }) } } },
    },
  }
}
