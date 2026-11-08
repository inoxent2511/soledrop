import "server-only"
import { publicEnv } from "./env"
import { serverEnv } from "./env.server"

/** Server security/redirect configuration must remain configurable after a standalone build. */
export const serverSiteUrl = () => serverEnv.SITE_URL ?? publicEnv.NEXT_PUBLIC_SITE_URL
