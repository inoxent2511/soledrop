import QRCode from "qrcode"

import { adminService } from "@/server/admin"
import { staffToken } from "@/server/admin/dal"
import { adminRoute } from "@/server/admin/route"

/** Starts TOTP enrolment: the secret as text and as a QR code (an SVG data URI, allowed by img-src). */
export const POST = adminRoute("pending", async () => {
  const { secret, uri } = await adminService().beginEnrolment(await staffToken())
  const svg = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" })
  return Response.json({ secret, uri, qr: `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}` })
})
