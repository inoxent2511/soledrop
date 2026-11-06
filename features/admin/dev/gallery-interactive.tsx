"use client"

import { useId, useState } from "react"

import { BlockEditor } from "@/components/admin/block-editor"
import { adminButton } from "@/components/admin/button"
import { ConfirmDialog } from "@/components/admin/confirm-dialog"
import { AdminField, AdminSelect } from "@/components/admin/form"
import { FormDialog } from "@/components/admin/form-dialog"
import { PermissionMatrix, type PermissionCatalog } from "@/components/admin/permission-matrix"
import { RuleBuilder } from "@/components/admin/rule-builder"
import type { CollectionRule } from "@/server/catalog/types"
import type { ContentBlock } from "@/server/content/types"

/** The interactive shared components with sample state; nothing here calls an API. */
export function GalleryInteractive({ catalog }: { catalog: PermissionCatalog }) {
  const id = useId()
  const [confirm, setConfirm] = useState(false)
  const [form, setForm] = useState(false)
  const [rules, setRules] = useState<CollectionRule[]>([{ field: "kind", equals: "preloved" }])
  const [blocks, setBlocks] = useState<ContentBlock[]>([{ type: "heading", text: "A heading", level: 2 }, { type: "paragraph", text: "A paragraph." }])
  const [permissions, setPermissions] = useState(new Set(["orders:read", "orders:fulfil"]))
  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => setConfirm(true)} className={adminButton({ tone: "danger" })}>
          ConfirmDialog
        </button>
        <button type="button" onClick={() => setForm(true)} className={adminButton({ tone: "secondary" })}>
          FormDialog
        </button>
      </div>
      <ConfirmDialog open={confirm} onOpenChange={setConfirm} title="Cancel SD10001?" consequence="States what will happen, in plain words." confirmLabel="Cancel order" typeToConfirm="SD10001" reason="required" onConfirm={() => setConfirm(false)} />
      <FormDialog open={form} onOpenChange={setForm} title="A form in a dialog" submitLabel="Save" onSubmit={() => setForm(false)}>
        <AdminField formId={id} name="field" label="A field" hint="With a hint." />
        <AdminSelect formId={id} name="choice" label="A choice">
          <option>One</option>
          <option>Two</option>
        </AdminSelect>
      </FormDialog>
      <section className="flex flex-col gap-2">
        <h2 className="text-18 font-bold">RuleBuilder</h2>
        <RuleBuilder rules={rules} onChange={setRules} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-18 font-bold">BlockEditor</h2>
        <BlockEditor blocks={blocks} onChange={setBlocks} faqCategories={["Delivery", "Returns"]} />
      </section>
      <section className="flex flex-col gap-2">
        <h2 className="text-18 font-bold">PermissionMatrix</h2>
        <PermissionMatrix catalog={catalog.slice(0, 3)} selected={permissions} onChange={setPermissions} />
      </section>
    </div>
  )
}
