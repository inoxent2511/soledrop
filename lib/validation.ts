import { config } from "zod/v4/core"
import en from "zod/v4/locales/en.js"

// Even Zod's caught dynamic-code probe emits a violation under the admin's strict CSP.
config({ ...en(), jitless: true })
