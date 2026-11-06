import { config } from "zod"

// Even Zod's caught dynamic-code probe emits a violation under the admin's strict CSP.
config({ jitless: true })
