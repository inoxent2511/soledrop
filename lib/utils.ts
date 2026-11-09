import { createCn } from "cn/engine"

import tables from "@/lib/cn-tables"

/**
 * Tailwind class merger fitted to our theme: the generated tables know the token scales
 * (font sizes, colours, radii), so a size like `text-30` never knocks out a colour like
 * `text-brand`. The build regenerates the fitted tables; run `pnpm cn:generate` after editing classes or tokens.
 */
export const cn = createCn(tables)
