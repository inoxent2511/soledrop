import "server-only"

import type { Permission } from "@/server/admin/permissions"
import type { RequestMeta } from "@/server/admin/service"
import type { StaffContext } from "@/server/admin/types"
import type { SearchRepository } from "@/server/search/repository"
import { DomainError } from "@/server/shared/errors"
import { newId } from "@/server/shared/ids"

/** Staff search tools (admin A8): what shoppers look for, what finds nothing, and the synonyms that fix it. */

type Audit = (staff: StaffContext, meta: RequestMeta, entry: { action: string; entity: string; entityId: string; before?: unknown; after?: unknown; reason?: string | null; storeId: string }) => Promise<void>

const need = (staff: StaffContext, permission: Permission) => {
  if (!staff.permissions.includes(permission)) throw new DomainError("forbidden", "You don't have permission to do that.", { permission })
}

const clean = (value: string) => value.trim().toLowerCase().replace(/\s+/g, " ")

export function createStaffSearch(deps: { search: SearchRepository; audit: Audit; revalidate: () => void }) {
  const { search } = deps
  return {
    async report(staff: StaffContext, days: number) {
      need(staff, "search:read")
      return search.report(staff.member.storeId, days, 50)
    },

    async synonyms(staff: StaffContext) {
      need(staff, "search:read")
      return (await search.listSynonyms(staff.member.storeId)).sort((a, b) => a.term.localeCompare(b.term))
    },

    /** "trainers" → sneakers, shoes: a search for the term also finds products matching any synonym. */
    async saveSynonym(staff: StaffContext, meta: RequestMeta, input: { term: string; synonyms: string[] }, id?: string) {
      need(staff, "search:write")
      const term = clean(input.term)
      const synonyms = [...new Set(input.synonyms.map(clean).filter((word) => word && word !== term))]
      if (!term) throw new DomainError("validation", "Add the word shoppers type.")
      if (!synonyms.length) throw new DomainError("validation", "Add at least one other word.")
      const existing = await search.listSynonyms(staff.member.storeId)
      const before = id ? existing.find((group) => group.id === id) : undefined
      if (id && !before) throw new DomainError("not_found", "Synonym not found.")
      const saved = await search.saveSynonym(staff.member.storeId, { id: before?.id ?? newId(), term, synonyms })
      await deps.audit(staff, meta, { action: before ? "synonym.updated" : "synonym.created", entity: "synonym", entityId: saved.id, before, after: saved, storeId: staff.member.storeId })
      deps.revalidate()
      return saved
    },

    async deleteSynonym(staff: StaffContext, meta: RequestMeta, id: string) {
      need(staff, "search:write")
      const before = (await search.listSynonyms(staff.member.storeId)).find((group) => group.id === id)
      if (!before) throw new DomainError("not_found", "Synonym not found.")
      await search.deleteSynonym(staff.member.storeId, id)
      await deps.audit(staff, meta, { action: "synonym.deleted", entity: "synonym", entityId: id, before, storeId: staff.member.storeId })
      deps.revalidate()
    },
  }
}
