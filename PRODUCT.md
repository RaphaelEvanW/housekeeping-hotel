# Housekeeping

<!-- impeccable:product-schema 1 -->

This is the durable product context for Impeccable. `PROJECT.md` remains the authoritative business specification; read its relevant sections before designing a workflow. This summary does not replace its rules or authorize implementation of a new milestone.

## Platform

web

## Users

- Housekeeping Staff perform routine inventory, guest-visit, borrowing, return, issue-reporting, repair-recording, and recovery work.
- HK Supervisors perform operational verification and the specifically required approvals, retirement, and reactivation.
- Management approves WRITE_OFF and the specified Management-access decisions. System Admin / IT manages technical access without automatically receiving business approval authority.
- Guests are the subjects of visit and borrowing records, not the primary operators. Engineering and external vendors do not need app accounts.

## Product Purpose

An independent internal hotel application for tracing physical loanable items, their availability, guest borrowing obligations, returns, inspection, maintenance, loss, and operational history. Success means staff can record real events simply while knowing which exact units are available and which obligations remain unresolved.

## Operating Context

- Owner confirmed on 2026-10-16: staff use a mixture of phones during operational work and computers at the Housekeeping desk. Support both for the same workflows, including per-unit photo evidence.
- User-facing language is primarily Indonesian. Use readable unit codes, clear labels, sensible defaults, conditional fields, and useful batch actions.
- Guest visits are entered manually for the MVP, one visit per stay. Preserve original responsible-guest and room snapshots on historical borrowings.
- The Next.js application and AppSheet run independently. AppSheet is a workflow reference only; no shared database, synchronization, API integration, or live-data copying.
- Physical handoffs, payment handling, replacement suitability, and guest damage-liability disputes remain real-world operational matters outside the app's agreed recording and approval flows.

## Capabilities and Constraints

The following are confirmed product requirements, not claims that all features are implemented:

- Keep item types (`Items`) separate from physical units (`ItemUnits`). Derive stock from unit records; distinguish adding a type from adding stock. Prevent duplicate normalized item names.
- Keep lifecycle, custody/location, physical condition, readiness/holds, and guest obligations separate. LOST/MISSING are not physical conditions. Server-side eligibility and concurrency checks govern borrowing.
- Issue exact eligible units to a STAYING guest visit, with fresh mandatory photo evidence per unit. Each issue occasion has its own borrowing record.
- Support partial and combined returns across borrowings for one visit. Default condition is GOOD; non-GOOD requires a photo and inspection. Save actual receiving location per line. Physical return closes only that unit's obligation, even if damaged.
- Add Stock selects one active initial location for the whole batch; new units remain in HOUSEKEEPING custody. Approved replacement units retain the confirmed HK Main Storage default. Existing legacy Add Stock requests may omit location and use their original storage fallback.
- Staff may immediately report issues and correct routine clerical errors. Supervisor verification requires per-unit Result, Notes, and Photo. Recording completed repairs does not automatically make a unit ready.
- Preserve the specified LOST settlement roles: Supervisor approves replacement/compensation; Supervisor proposes WRITE_OFF and Management approves. Replacement creates exactly one new unit only after receipt and approval. Settlement must not fabricate a return; later recovery is a separate event.
- Coupled operations and batch saves are all-or-nothing. Reject double borrowing, duplicate returns, and duplicate settlement effects. Preserve audited history and finalized evidence, including after checkout or retirement.
- Validate and authorize mutations on the server. Treat guest information and evidence photos as sensitive; do not expose private evidence URLs or invent production data.
- No PMS, payment integration, multi-property, repair dispatch, or additional approval chains without explicit scope changes. Report export is a future requested direction; no reporting implementation is implied.

Existing implementation uses Next.js App Router, TypeScript, Tailwind CSS, Prisma/PostgreSQL, and Better Auth. Login and the responsive workspace shell are implemented. Dashboard statistics are explicitly labelled Data demonstrasi. Inventory supports real catalog search/cards/table, create type with optional catalog photo/description, edit type name/description, Add Stock, physical-unit details/serial-description correction and audit history. Deactivation submission/list/filters, Supervisor decisions and requester cancellation have connected frontend controls. Unit-name backend persistence/Add Stock/PATCH/read/audit is implemented as of26October2026; the disabled frontend name fields are not yet connected. Initial-unit-photo persistence remains pending backend work. Operational requirements above must not be presented as already shipped. Check source and `docs/DEVLOG.md` for current implementation evidence.

Open technical/operational decisions include production hosting and photo storage configuration, limits, and retention. No product-specific accessibility standard or offline-use requirement has been confirmed.

## Brand Commitments

The internal product is named Housekeeping and communicates in straightforward Indonesian. Mövenpick Hotel is the approved display name. Workspace uses the approved Figma light/navy/amber direction and Inter; owner revisions and responsive component rules live in docs/DESIGN_SYSTEM.md. Preserve the accepted photo/layout and navy-glass login during refinement; its assets and provenance are documented in `docs/LOGIN-DESIGN.md`. This does not establish a visual recipe for every future surface.

## Evidence on Hand

- `PROJECT.md`: confirmed workflows, roles, invariants, and acceptance cases.
- `src/app/login/` and `public/images/login/`: existing login implementation and decorative assets, including a portrait mobile background.
- `docs/LOGIN-DESIGN.md`: generated background/emblem provenance. Decorative synthetic imagery is not evidence of real hotel staff or operations.
- `docs/DEVLOG.md`: dated implementation and verification records, distinguishing owner reports from agent checks.
- No customer testimonials, business performance metrics, or operational dashboard totals have been established for use as product claims.

## Product Principles

1. Trace physical units and real events accurately; never simplify away the distinction between stock, condition, custody, and obligations.
2. Make routine staff work direct, with defaults and batch entry instead of unnecessary questions and approvals.
3. Preserve historical truth and enforce atomic, authorized changes on the server.
4. Support both phone-based operations and desk work in Indonesian.
5. Keep the application independent and its scope tied to confirmed Housekeeping needs.
