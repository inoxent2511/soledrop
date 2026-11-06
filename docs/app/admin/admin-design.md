# Admin — design principles

There is no Figma for the back-office. It is designed from the storefront's design system: the same tokens (`styles/tokens.generated.css`), text styles, radii, shadows, icons and primitives, so nothing new enters the visual vocabulary. The architecture tests that forbid raw colours and physical-direction classes apply to `/admin` too.

## Principles

1. **Dense, not cramped.** Tables use 14/16 px text and 48 px rows. One accent (`brand` lime) marks the primary action and the current nav item; everything else is ink on white/surface. A compact-density switch is not implemented.
2. **Scan first.** Every list leads with the identifier the staff member searches for (order number, product title, customer email), then status as a coloured pill, then numbers right-aligned in tabular figures.
3. **Keyboard-first.** ⌘K / Ctrl+K opens the command palette; `/` focuses the list search; links and controls follow normal Tab order; dialogs manage focus. A `?` shortcuts sheet and arrow-key table navigation are not implemented.
4. **Status by colour and word.** `success` for paid/delivered, `brand-tint` for pending, `destructive` for failed/cancelled — always with a text label, never colour alone.
5. **Destructive actions are slow on purpose.** Irreversible actions (refund, cancel, delete, anonymise, revoke) use a confirm dialog that states the consequence; the most dangerous ones need the subject typed (type-to-confirm) and a reason; sensitive ones need a fresh second factor (step-up).
6. **Protect edits.** Product forms have a dirty-state guard; products and pages can be saved as drafts. Product, page and role saves check `updated_at` for concurrent edits. Automatic draft persistence and a global session-expiry draft recovery flow are not implemented.
7. **One place for the truth.** Admin writes go through the same domain services as the storefront, so the state machine, stock ledger, events, emails, webhooks and audit entries are identical whoever acts.

## Layout

- **Sidebar** (data-driven from the module registry, filtered by permissions; a drawer on phones), **top bar** (command palette, notifications, account), **page header** (breadcrumbs, title, primary and secondary actions), **content**. The admin uses the light theme (A-012); there is no theme switch or desktop sidebar-collapse control.
- **Detail pages** use a main column plus a sticky side column (status, customer, totals, actions).
- Usable from tablet width; on phones the key on-the-go tasks work: orders list and detail, fulfil, stock check, notifications.

## Shared admin components

Built under `components/admin/` from existing primitives and tokens only. `/admin/dev/gallery` has sample tables, filters, pagination, detail layout, cards, timeline, diffs, dialogs and editors, behind `dashboard:read`. Its examples never submit store changes. The shell, command palette and notifications are available around the gallery; step-up is exercised through real sensitive actions, and no-access through a permission refusal.

| Component | Purpose |
|---|---|
| `AdminShell` | sidebar + top bar + content frame |
| `PageHeader` | breadcrumbs, title, description, actions |
| `AdminCard`, `adminButton`, form controls | shared cards, button tones, labelled inputs and validation messages |
| `DataTable` | server-rendered rows, linked identifiers, numeric alignment, responsive columns and empty content; list pages own filters, sort and export |
| `FilterBar`, `Pagination` | search, select/date filters and quick views synced to the URL; server paging links |
| `StatCard` | KPI with an optional comparison and trend indicator |
| `StatusPill` | status word on its semantic colour |
| `DetailLayout` | main + sticky side column |
| `Timeline` | dated events (order history, audit) |
| `DiffViewer` | before/after of an audit entry |
| `PermissionMatrix` | role × permission grid (read-only and editable) |
| `ConfirmDialog` | consequence text, optional type-to-confirm and reason |
| `FormDialog` | labelled form, validation message and pending submit state |
| `StepUpProvider` | asks for the current TOTP code before retrying a sensitive action |
| `RuleBuilder`, `BlockEditor` | collection rules and content blocks with live sample state |
| `CommandPalette` | ⌘K search over modules, entities and actions |
| `EmptyState` | what this list is, and the first action |
| `NoAccess` | the 403 page, explaining which permission is missing |
