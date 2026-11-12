import { Inbox } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { z } from "zod"

import { AdminCard } from "@/components/admin/card"
import { adminButton } from "@/components/admin/button"
import { EmptyState } from "@/components/admin/empty-state"
import { PageHeader } from "@/components/admin/page-header"
import { Pagination } from "@/components/admin/pagination"
import { permissionPage } from "@/server/admin/dal"
import { staffContent } from "@/server/content"

export const metadata: Metadata = { title: "Contact messages" }

const params = z.object({ page: z.coerce.number().int().min(1).max(10_000).catch(1) })
const pageSize = 25
const displayDate = (value: string) => new Intl.DateTimeFormat("en-PK", {
  dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Karachi",
}).format(new Date(value))

export default async function ContactMessagesPage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  const staff = await permissionPage("customers:read_pii", "/admin/messages")
  const page = params.parse(await searchParams).page
  const { messages, total } = await staffContent().contactMessages(staff, { page, pageSize })

  return <>
    <PageHeader title="Contact messages" description="Messages submitted through the store contact form. Reply from your support mailbox." />
    {messages.length === 0 ? <EmptyState icon={Inbox} title="No messages here">New customer messages will appear here.</EmptyState> : (
      <div className="flex flex-col gap-4">
        {messages.map((item) => <AdminCard
          key={item.id}
          title={item.name}
          description={<time dateTime={item.createdAt}>{displayDate(item.createdAt)}</time>}
          actions={<a className={adminButton({ tone: "secondary", size: "sm" })} href={`mailto:${item.email}?subject=${encodeURIComponent(item.orderNumber ? `Re: order ${item.orderNumber}` : "Re: your Sole Drop message")}`}>Reply by email</a>}
        >
          <div className="flex flex-wrap gap-x-6 gap-y-1 text-14">
            <span><span className="text-subtle-foreground">Email: </span><a className="underline underline-offset-4" href={`mailto:${item.email}`}>{item.email}</a></span>
            {item.orderNumber ? <span><span className="text-subtle-foreground">Order: </span><Link className="underline underline-offset-4" href={`/admin/orders/${encodeURIComponent(item.orderNumber)}`}>{item.orderNumber}</Link></span> : null}
          </div>
          <p className="whitespace-pre-wrap wrap-break-word text-16">{item.message}</p>
        </AdminCard>)}
      </div>
    )}
    <Pagination basePath="/admin/messages" params={{}} page={page} pageSize={pageSize} total={total} />
  </>
}
