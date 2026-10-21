# Housekeeping working context

Snapshot: 2026-10-21. Inspected HEAD: `34fdde8` (harden inventory mutation request validation), branch `feature/backend`. Uncommitted work includes item search/pagination, audited rename, deactivation request APIs and migration/tests, audited unit-detail correction API/tests, JSON-reader tests, and documentation. Preserve all changes and inspect diffs before editing.

## Sources and preferences

- Confirmed 2026-10-21: Item deactivation requires a pending request from Staff/Supervisor and a separate Supervisor approval (self-approval allowed); requester can cancel. See PROJECT 5.1.1. These APIs are implemented; new-borrowing impact/reactivation remain open.
- Business truth: `PROJECT.md`; repository rules: `AGENTS.md`; history: `docs/DEVLOG.md`.
- Owner normally types application code with precise Indonesian guidance, exact paths, and complete relevant blocks. Direct application edits require an explicit request. Explain why the code works.
- Owner confirmed 2026-10-21: do not guide temporary production stubs or permissive placeholder schemas merely to produce a RED test. Supply the intended complete implementation. Label test-preparation steps explicitly, and run checks after their required implementation exists. This explicit workflow preference overrides conflicting skill instructions to introduce scaffolds for RED; preserve meaningful regression coverage.
- Owner normally runs checks. Record owner reports separately from agent results; do not infer totals or fresh verification.
- Owner authorized ongoing progress-documentation edits on 2026-10-21: after each reported check result or completed step, append relevant evidence to DEVLOG and refresh CONTEXT when progress changes. Update PROJECT for confirmed requirements or material milestone status. This does not authorize application edits or commits.
- Owner requests Tailwind CSS for frontend work; the accepted login still uses a CSS Module pending migration.
- Global Ponytail skill at `~/.agents/skills/ponytail/SKILL.md` applies to coding tasks at `full` by default. Owner can request `lite`, `ultra`, or normal mode in chat. The standalone skill does not include Ponytail plugin commands/hooks.
- Global Humanizer skill at `~/.agents/skills/humanizer/SKILL.md` applies to reader-facing prose, interface copy, and project documentation when a natural voice matters. Preserve supported facts and voice; do not change code/data/frontmatter/link targets or optimize for AI detectors.
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
- Item search/pagination: `src/server/list-items-input.ts`, `src/server/list-items.ts`, GET `/api/items`. Audited rename: `src/server/items.ts`, PATCH `/api/items/[itemId]`. Unit reads/codes: `src/server/item-units.ts`, GET `/api/items/[itemId]/units`.
- Deactivation: `src/server/item-deactivation.ts`, `src/server/item-deactivation-input.ts`, migration `20261021090000_item_deactivation_requests`. Routes under `src/app/api/items/[itemId]/deactivation-requests/` and `src/app/api/item-deactivation-requests/` cover submission, Supervisor decisions, requester cancellation, and paginated reads. List service is `src/server/list-item-deactivation.ts` (singular). Tests: `tests/integration/item-deactivation-{api,schema}.test.ts`.

## Evidence and limits

- Latest owner verification (2026-10-21): supplied successful typecheck output after the invalid-query test array was typed `Record<string, string>[]`; then confirmed test database startup, `db:migrate:test`, focused `item-deactivation-api.test.ts` integration tests, and lint succeeded. No test totals supplied, no agent rerun, and no current full-suite/build result claimed.
- Earlier checks reported today cover JSON-reader boundary tests, item search/pagination, audited rename, and deactivation schema/submission/decision/cancellation. The final message in the previous chat `Login page` already reported tests passed; its handoff retained the earlier TS2345 warning. The current chat reconfirmed the focused checks above.
- Owner reports Origin/Content-Type and oversized-body integration checks passed, along with the requested typecheck/lint; no totals or agent rerun claimed. JSON reader: `src/server/read-json-body.ts`, 256 KiB limit enforced while reading bytes.
- Owner reports Add Stock integration tests, typecheck and lint passed; full output/totals not supplied. Test file: `tests/integration/add-stock-api.test.ts`. Agent has not rerun these tests.
- Agent ran `npm run typecheck` successfully after the root redirect change on 2026-10-20. Browser behavior was not independently checked.
- Owner reported master-item tests passed after fixing a missing test closure, then committed 93eac36. Complete test output/counts were not supplied; no agent rerun on 2026-10-20.
- Relevant files: `tests/integration/items-api.test.ts`, `tests/integration/foundation.test.ts`, `tests/unit/permissions.test.ts`. API tests simulate active-user lookup while using real authorization and the test database.
- Earlier owner confirmations cover frontend routing/checks, login/logout, inactive-account rejection and helper tests. See DEVLOG for exact historical scope.
- Historical agent checks on 2026-10-15: lint, typecheck, 43 tests, production build and listed login browser checks passed. These do not verify later inventory changes.
- Existing sessions are not automatically revoked by deactivation; current-user checks reject access. Every endpoint needs server authorization.

## Next slice and boundaries

- Deactivation request API slice through paginated review/history has owner-confirmed checks. The overall inventory/backend milestone remains incomplete. Total registered units must not be labeled borrowable stock.
- Unit-detail correction API is implemented with owner-confirmed focused and full-suite success. Validation: `src/server/item-unit-input.ts`; service: `updateItemUnitDetails` in `src/server/item-units.ts`; permission: `inventory:unit:update`; PATCH: `src/app/api/item-units/[unitId]/route.ts`. Tests: `tests/integration/update-item-unit.test.ts`. Owner confirmed the full suite passed after correcting the CLI typo to `npm.cmd test -- --no-file-parallelism`; final output/totals were not supplied, and no agent rerun or current production build is claimed. Seed tests assert global database counts, so run files serially.
- Unit audit history slice has owner-confirmed focused test, typecheck/lint, and full-suite success after the latest guidance; detailed output/totals and agent rerun are not claimed. Schema: `itemUnitHistoryInputSchema` in `src/server/item-unit-input.ts`; query: `src/server/item-unit-history.ts`; GET: `src/app/api/item-units/[unitId]/history/route.ts`; tests: `tests/integration/update-item-unit.test.ts`. Coverage includes access roles, safe actor fields, pagination, entity/unit isolation, empty/missing/invalid input, and inactive/retired history. This reads existing audit events, not unimplemented future operational workflows.
- GuestVisit foundation under PROJECT 4: model/enum/User inverse relations, migration `prisma/migrations/20261021100000_guest_visits/migration.sql`, and `tests/integration/guest-visit-schema.test.ts` are present. Owner reports migration/client setup, schema tests, typecheck, and lint succeeded; final output/totals and agent DB verification were not supplied. Registration validation/service/route are absent, so registration is not complete. Duplicate override reason must be captured in audit by the future service; no unique guest-name/room constraint or stay merge.
- Owner selected FE inventory using existing APIs; GuestVisit registration pauses at its schema foundation. The frontend transition has been announced. Overall backend scope remains incomplete.
- Confirmed frontend brief: Tailwind, dark-brown frame, dark content surfaces instead of white/cream panels. Proposed palette/layout: `docs/INVENTORY-DESIGN.md`; no approved comp or UI implementation yet. Preserve accepted login unless explicitly included in redesign scope.
- Impeccable context/setup ran for the absent `src/app/(workspace)/inventory/page.tsx`; comp-first is configured and DESIGN.md is absent. Existing workspace is light. Next: owner backend checkpoint commit, then visual comps before owner-written FE implementation. No application edits or new app checks by agent.
- Agent ran `npm run db:validate` successfully on 2026-10-20. Owner reports migration/generation/typecheck/tests passed; detailed output/totals not supplied. Migration application was not independently queried. Stock derives from physical units, never a writable total.
- Seed: `prisma/seed-reference.ts`; default location code: `HK_MAIN_STORAGE`. No location-choice step for new stock.
- Development/test databases are separate; test port 5434. Never use development data for integration tests.
- Commands: `package.json`, `prisma.config.ts`, `scripts/migrate-test.ts`, `vitest.config.mts`. No npm check script exists.
- Never record secrets or guest data in context. No AppSheet synchronization, PMS, payments, reporting subsystem or multi-property scope.
