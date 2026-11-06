# Admin — design principles

There is no Figma for the back-office. It is designed from the storefront's design system: the same tokens (`styles/tokens.generated.css`), text styles, radii, shadows, icons and primitives, so nothing new enters the visual vocabulary. The architecture tests that forbid raw colours and physical-direction classes apply to `/admin` too.

## Principles

1. **Dense, not cramped.** Tables use 14/16 px text and 44 px rows on touch, 36 px rows in compact density. Page padding is half the storefront's. One accent (`brand` lime) marks the primary action and the current nav item; everything else is ink on white/surface.
2. **Scan first.** Every list leads with the identifier the staff member searches for (order number, product title, customer email), then status as a coloured pill, then numbers right-aligned in tabular figures.
3. **Keyboard-first.** ⌘K opens the command palette everywhere; `/` focuses the list search; `?` shows the shortcuts sheet; tables are navigable with arrows; every dialog traps and returns focus.
4. **Status by colour and word.** `success` for paid/delivered, `brand-tint` for pending, `destructive` for failed/cancelled — always with a text label, never colour alone.
5. **Destructive actions are slow on purpose.** Irreversible actions (refund, cancel, delete, anonymise, revoke) use a confirm dialog that states the consequence; the most dangerous ones need the subject typed (type-to-confirm) and a reason; sensitive ones need a fresh second factor (step-up).
6. **Never lose work.** Long forms keep a dirty-state guard and save drafts; a concurrent edit is detected (`updated_at` check) and offered as a conflict to resolve, never silently overwritten.
7. **One place for the truth.** Admin writes go through the same domain services as the storefront, so the state machine, stock ledger, events, emails, webhooks and audit entries are identical whoever acts.

## Layout

- **Sidebar** (collapsible, data-driven from the module registry, filtered by the staff member's permissions, badges for pending work), **top bar** (command palette, notifications, theme, account), **page header** (breadcrumbs, title, primary and secondary actions), **content**.
- **Detail pages** use a main column plus a sticky side column (status, customer, totals, actions).
- Usable from tablet width; on phones the key on-the-go tasks work: orders list and detail, fulfil, stock check, notifications.

## Shared admin components

Built under `components/admin/` (used by every module) from existing primitives and tokens only; each is shown in the gallery route `/admin/dev/gallery`.

| Component | Purpose |
|---|---|
| `AdminShell` | sidebar + top bar + content frame |
| `PageHeader` | breadcrumbs, title, description, actions |
| `DataTable` | server-side paginated list: search, filters, sort, column visibility, row selection, bulk bar, density, CSV export, empty/loading/error states |
| `FilterBar` | typed filters (text, select, multi-select, date range, number range, boolean) synced to the URL |
| `StatCard` | KPI with comparison and sparkline |
| `StatusPill` | status word on its semantic colour |
| `DetailLayout` | main + sticky side column |
| `Timeline` | dated events (order history, audit) |
| `DiffViewer` | before/after of an audit entry |
| `PermissionMatrix` | role × permission grid (read-only and editable) |
| `ConfirmDialog` | consequence text, optional type-to-confirm and reason |
| `StepUpDialog` | asks for the current TOTP code before a sensitive action |
| `CommandPalette` | ⌘K search over modules, entities and actions |
| `EmptyState` | what this list is, and the first action |
| `NoAccess` | the 403 page, explaining which permission is missing |
