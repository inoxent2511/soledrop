import { job } from "@/server/http/jobs"
import { platform } from "@/server/platform"

/** Bounded maintenance of expired ephemeral records; never touches merchant history. */
export const POST = job(() => platform().cleanup(500))
