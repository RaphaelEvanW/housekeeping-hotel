# Housekeeping working context

Snapshot: 2026-10-20. Inspected HEAD: `86f0291` (inventory : add stock batches with unit audit), branch `feature/backend`. Root-page redirect, documentation and an owner change in next.config.ts are uncommitted. Recheck before editing.

## Sources and preferences

- Business truth: `PROJECT.md`; repository rules: `AGENTS.md`; history: `docs/DEVLOG.md`.
- Owner normally types application code with precise Indonesian guidance, exact paths, and complete relevant blocks. Direct application edits require an explicit request. Explain why the code works.
- Owner normally runs checks. Record owner reports separately from agent results; do not infer totals or fresh verification.
- Warn before moving between frontend/backend work. Do not commit, push, switch branches, or discard work without authorization.
- Product context: `PRODUCT.md`; login provenance: `docs/LOGIN-DESIGN.md`. Impeccable preference: comp-first; mixed phone/desktop use; live mode has not been verified. Antislop session mode: during.

## Current implementation

- Next.js 16.4.0, React 19.3.0, Prisma 7.10.0, Better Auth 1.7.7, Tailwind 4, Vitest 4.1.11. Read relevant installed Next docs before framework changes.
- Auth: `src/server/auth.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`. Email/password login; signup disabled. Session creation rejects inactive users.
- `src/server/get-active-user.ts` reads current account activity/roles. `require-active-user.ts` redirects anonymous/inactive users; `require-permission.ts` checks permissions; `authorize-api.ts` provides JSON 401/403. Helpers protect only their callers.
- Permissions: `src/lib/permissions.ts`. Staff/Supervisor create master items; Management reads operational records and retains specific approvals; IT has administration access unless given additional roles. Multiple roles combine. Confirmed policy: PROJECT section 3.
- Accepted login: `src/app/login/`; warm hotel photo, translucent champagne form, brown/gold accents, mobile form-only presentation. Successful login navigates to `/start`.
- Root route `src/app/page.tsx` redirects directly to `/login`. After login, `/start` chooses the first available authorized route from `src/lib/navigation.ts`. Workspace layout/sidebar: `src/app/(workspace)/`; Dashboard and Administration are starter pages. `/access-denied` is outside the group. Shared logout: `src/components/logout-button.tsx`.
- `next.config.ts` excludes CSS Modules from the Tailwind loader rule; preserve the fix unless investigating the original missing-class repro.
- Item master: `prisma/schema.prisma`; migration `prisma/migrations/20261019093821_item_master/`.
- `src/server/items.ts` prepares display/normalized names and creates Item plus audit in a transaction. `src/app/api/items/route.ts` exposes authorized GET/POST, validates input, maps duplicate names to 409, and uses authenticated actor IDs.
- ItemUnit schema and migration `20261020014500_item_units` exist, with separate lifecycle/custody/condition/readiness/loss enums and unique sequence-generated unitNumber. StockBatch migration: `20261020022919_stock_batches`.
- Add Stock: `src/server/add-stock-input.ts`, `src/server/add-stock.ts`, `src/app/api/stock-batches/route.ts`. Staff/Supervisor permission, atomic batch/units/per-unit audit, default storage, non-GOOD inspection, and request-ID replay/conflict handling are implemented. Borrowing, returns, operational metrics and account administration remain pending.

## Evidence and limits

- Owner reports Add Stock integration tests, typecheck and lint passed; full output/totals not supplied. Test file: `tests/integration/add-stock-api.test.ts`. Agent has not rerun these tests.
- Agent ran `npm run typecheck` successfully after the root redirect change on 2026-10-20. Browser behavior was not independently checked.
- Owner reported master-item tests passed after fixing a missing test closure, then committed 93eac36. Complete test output/counts were not supplied; no agent rerun on 2026-10-20.
- Relevant files: `tests/integration/items-api.test.ts`, `tests/integration/foundation.test.ts`, `tests/unit/permissions.test.ts`. API tests simulate active-user lookup while using real authorization and the test database.
- Earlier owner confirmations cover frontend routing/checks, login/logout, inactive-account rejection and helper tests. See DEVLOG for exact historical scope.
- Historical agent checks on 2026-10-15: lint, typecheck, 43 tests, production build and listed login browser checks passed. These do not verify later inventory changes.
- Existing sessions are not automatically revoked by deactivation; current-user checks reject access. Every endpoint needs server authorization.

## Next slice and boundaries

- Next guided backend slice: paginated unit reads per Item, readable unit codes and total registered count derived from ItemUnit. Borrowable counts must eventually include unresolved borrowing obligations; do not label total registered units as available.
- Agent inspected ItemUnit schema/migration and ran `npm run db:validate` successfully on 2026-10-20. Owner reports migration/generation/typecheck/tests passed; detailed output/totals not supplied. Migration application was not independently queried. Derived display code `HK-000001` remains to be implemented from unitNumber. Stock derives from physical units, never a writable total.
- Seed: `prisma/seed-reference.ts`; default location code: `HK_MAIN_STORAGE`. No location-choice step for new stock.
- Development/test databases are separate; test port 5434. Never use development data for integration tests.
- Commands: `package.json`, `prisma.config.ts`, `scripts/migrate-test.ts`, `vitest.config.mts`. No npm check script exists.
- Never record secrets or guest data in context. No AppSheet synchronization, PMS, payments, reporting subsystem or multi-property scope.
