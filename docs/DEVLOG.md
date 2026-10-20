# Development History

`PROJECT.md` is the business source of truth. This log records completed implementation steps and verified technical results. Entries contain no credentials or tokens.

## 2026-10-15 | Project-local antislop skill

- Installed the standalone `antislop` core from `miqdadbadjuber/anti-slop`, path `skills/antislop`, upstream `main`; bundled VERSION is `3.2.20`.
- Added `.agents/skills/antislop/SKILL.md` and `VERSION`. Recorded the owner's automatic-on-relevant-tasks preference in `AGENTS.md`, limited to UI, interface copy, accessibility, responsive layout, and code comments. No global installation or optional companion skills.
- Verified the installed skill frontmatter and version file. No application code, dependencies, or business rules changed; application tests were not run for this instruction-only installation. Usage mode (`during`/`after`) remains unresolved until relevant activation.

## 2026-10-14 | Phase 1, Step 1: Database Toolchain & Baseline Tests

Retrospective entry based on the implementation and verification recorded when Step 1 was completed.

- **Implemented:** isolated PostgreSQL 17 development/test containers, Prisma 7.10.0 client generation, server-only connection module, Zod environment validation, and Vitest 4.1.11 baseline tests.
- **Files/modules:** `compose.yaml`, `.env.example`, `prisma/schema.prisma`, `prisma.config.ts`, `src/server/{env,db}.ts`, `vitest.config.mts`, `tests/setup.ts`, environment/connection tests, package files, ESLint configuration, `.gitignore`, README, and two domain-invariant corrections in `AGENTS.md`.
- **Decisions:** development data uses a named volume; test data uses disposable storage. Test connections require a dedicated loopback database/user and cannot fall back to development. Existing framework versions were preserved. No schema migrations or business tables were created at this step.
- **Verified:** development connection succeeded; both containers healthy; Prisma generate/validate, ESLint, TypeScript, production build, and all **18 tests** passed. Integration tests exercised actual PostgreSQL commit and rollback. Environment and generated client files were confirmed ignored by Git.
- **Environment issue:** a shadowing `docker` command on Windows required Docker Desktop's real executable/PATH. Workaround documented in README; no remaining execution blocker.
- **Next:** Step 2, foundation schema and reference seed.

## 2026-10-14 | Phase 1, Step 2: Foundation Schema & Seed

- **Implemented:** eight Prisma models/tables: `User/user`, `Session/session`, `Account/account`, `Verification/verification`, `Role/role`, `UserRole/user_role`, `Location/location`, and `AuditEvent/audit_event`. Added versioned migration `20261014091222_foundation` and idempotent reference seed.
- **Files/modules:** `prisma/schema.prisma`, `prisma/migrations/`, `prisma.config.ts`, `prisma/seed.ts`, `prisma/seed-reference.ts`, `scripts/migrate-test.ts`, `tests/helpers/transaction.ts`, foundation/seed integration tests, package files, README, this log, and the DEVLOG instruction in `AGENTS.md`.
- **Auth compatibility:** installed and pinned Better Auth **1.7.7**. Inspected its installed `@better-auth/core/dist/db/get-tables.mjs` and Prisma adapter. Auth IDs remain opaque strings; standard auth field names and relation names are retained. Real adapter CRUD and session/user joins passed against PostgreSQL. No auth instance, routes, login flow, or RBAC endpoints were implemented.
- **Integrity decisions:** unique email/session token/provider-account identity/reference codes; composite key for user-role assignments; FK constraints reject orphan records. Audit actor deletion/update is restricted. Session/account deletion cascades match the auth library. Verification identifiers are indexed but not unique. Dates use `timestamptz(3)`; Prisma maintains mutable records' `updatedAt` values.
- **Roles:** four explicit role codes with no numeric ranking or inheritance. A SYSTEM_ADMIN assignment does not create Supervisor/Management assignments. Enforcement of permissions remains a later step.
- **Seed:** one transaction inserts missing role codes and `HK_MAIN_STORAGE`. Conflict-safe inserts preserve existing IDs, labels, active flags, and user assignments. No accounts or credentials are created. Added `tsx` only for TypeScript seed/migration tooling.
- **Migration review:** inspected generated SQL before application: eight new tables, one role enum, indexes, and foreign keys; no operational tables or destructive changes. Wrapped the migration in a transaction. Applied successfully on development and empty test databases. Migration status is up to date; Prisma schema diff reports no difference. Re-running test migration deploy reports no pending migrations.
- **Verified:** seed command ran twice on development; direct database checks returned **4 roles, 1 active HK Main Storage, 0 users, 0 accounts, 0 role assignments**. All **39 tests** passed, covering adapter compatibility, uniqueness/FKs, delete behavior, seed reruns/preservation/rollback, and the original baseline tests. Prisma validation/generation, ESLint, TypeScript, and production build passed.
- **Known issues/limits:** `npm audit` reports **9 high-severity dependency findings** in existing Prisma/ESLint dependency chains; these remain unresolved. No forced upgrades/downgrades were applied. Audit target IDs are generic references; the audited mutation writer and append-only application/database access controls are not yet implemented. No execution blocker remains for Step 2.
- **Next:** Step 3, authentication, only after explicit owner approval.

## 2026-10-15 | Project skills and compact working context

- Installed `playwright` and `security-best-practices` from `openai/skills` (`main`, `skills/.curated/`) into `.agents/skills/`. Added a local PowerShell invocation note to Playwright; no application dependencies or browser binaries installed.
- Created `.agents/skills/housekeeping-context/SKILL.md` and `docs/CONTEXT.md`. The snapshot records inspected HEAD `c5de801`, relevant source/test paths, historical verification limits, and untracked login work. It explicitly distinguishes existing auth source from older README/DEVLOG statements.
- Updated AGENTS.md to use focused context loading after initial orientation, with full specification reads when requirements change or cross-domain uncertainty requires them. Existing Next.js instructions and business invariants preserved. No global Codex memory setting changed.
- Verified all three skills' YAML frontmatter, names, descriptions, absence of TODO placeholders, and referenced UI assets with the existing Node `js-yaml` parser. Checked that context source paths exist and the snapshot stays below 100 lines. `npx.cmd` is available. `git diff --check` passed.
- Limitation: bundled `quick_validate.py` was attempted but could not run because PyYAML is missing; the checks above used an independent parser without installing dependencies. Application tests and browser execution were not run for this skill/documentation-only change. Skill selection and handoff behavior still require observation in subsequent tasks.

## 2026-10-15 | Guided login setup: owner-confirmed page and endpoint

- Owner implemented Better Auth server configuration, Prisma adapter connection, GET/POST catch-all handler, React auth client, and `/login` page/form while following step-by-step explanations. Public email/password sign-up is disabled in the inspected configuration.
- Owner confirmed the unauthenticated session endpoint returns `null`. After a TypeScript error caused by lowercase `loginForm`, the owner corrected the component name to `LoginForm` and reported the page works. Earlier auth-setup type checking was reported successful; no final typecheck output was supplied after the component correction.
- Agent inspected the current auth/client/route and login source; the import/JSX capitalization is corrected. Git HEAD is `c5de801`; login files remain untracked. This update changes only context/devlog documentation and does not edit application code.
- Verification scope: runtime confirmations above came from the owner. No agent-run browser, credential login, database, lint, typecheck, build, or automated auth tests were performed for this documentation update. A `null` session response does not prove database connectivity or successful login.
- Remaining: controlled development account creation, successful/failed credential and session tests, protected-page checks, inactive-account enforcement, logout, and role authorization. Authentication is not complete.
- Working preference: owner types most application code; agent guides in small explained steps and edits application code only on explicit request. Apply relevant project skills and retain owner-confirmed progress with clear evidence attribution.

## 2026-10-15 | Owner-confirmed credential login and session checks

- Owner reported completing the guided development-account step, then explicitly confirmed that an incorrect password was rejected, the correct password succeeded, and `/api/auth/get-session` returned the expected authenticated session response in the same browser.
- Evidence is the owner's manual test report. No credentials or session payloads were requested or recorded. Agent checked Git status: HEAD remains `c5de801`; `scripts/create-dev-user.ts` and `src/app/login/` are untracked. No application code was edited in this documentation update.
- No agent-run browser, database, typecheck, lint, build, or automated auth checks were performed in this step. These manual results do not establish account deactivation enforcement, role authorization, logout behavior, or full production readiness.
- Next teaching step: server-side session/current-account checks on a protected page, verified using authenticated and incognito browsers. Owner continues to type application code.

## 2026-10-15 | Owner-confirmed protected dashboard access

- Inspected owner-written `src/app/dashboard/page.tsx`: reads Better Auth session using request headers, redirects missing sessions to `/login`, and checks current `User.isActive` before rendering the account name.
- Owner confirmed both proposed manual cases: authenticated browser displays the dashboard; incognito without login redirects to `/login`. No account-deactivation test was reported. These are owner-run checks; no agent-run browser or application tests were performed.
- Dashboard remains untracked. Only context/devlog were edited by the agent; `git diff --check` was used for documentation whitespace validation. Next guided change is successful-login navigation, followed by logout. Remaining auth/RBAC work is not complete.

## 2026-10-15 | Owner-confirmed navigation after login

- Owner confirmed the successful-login navigation step and requested guided logout implementation. Inspected `src/app/login/login-form.tsx`: successful sign-in calls `window.location.replace("/dashboard")`; sign-in errors return before navigation.
- Confirmation is owner-reported manual evidence. No agent-run browser, typecheck, lint, or automated tests in this step. Agent edited documentation only and checked whitespace with `git diff --check`.
- Next: owner-written logout button, session-null check after logout, and denial of direct dashboard access. Logout is not yet implemented/verified by this entry.

## 2026-10-15 | Owner-confirmed logout flow

- Inspected owner-written `src/app/dashboard/logout-button.tsx` and its dashboard integration. The client button calls `authClient.signOut()`, handles pending/error states, and navigates to `/login` after a successful response.
- Owner confirmed the preceding manual test sequence works: logout redirects to login, the session endpoint returns null, direct dashboard access redirects to login, and logging in again restores access. Evidence is owner-reported; no session tokens or credentials were collected.
- Agent updated context/devlog only and ran `git diff --check`. No agent-run browser, lint, typecheck, build, database, or automated auth tests were executed in this step. HEAD remains `c5de801`; dashboard/login and the development-account script remain untracked.
- Remaining: inactive-account login rejection and deactivation testing, role authorization, and automated auth coverage. The basic manual flow is confirmed by the owner; complete auth/RBAC readiness is not established.

## 2026-10-15 | Inactive-account authentication test: RED

- Owner supplied command output confirming both database containers healthy and foundation migration applied to isolated `housekeeping_test` on port 5434.
- Owner ran `npm run test:integration -- tests/integration/auth.test.ts`: 25 tests passed, 1 failed across 4 files. Active-account login passed; inactive-account login failed with HTTP 200 instead of expected 401. This is the intended behavioral failure, not a connection/setup failure.
- Inspected auth test and server configuration. The test creates isolated temporary users/accounts and cleans them up; auth configuration does not yet reject inactive users before session creation. No application code edited by the agent.
- Next: owner implements a before-session-create hook and runs focused tests plus the full suite, lint, and typecheck. No GREEN result is claimed. Agent documentation check: `git diff --check`.

## 2026-10-15 | Inactive-account authentication test: focused GREEN

- Owner supplied output for `npx vitest run tests/integration/auth.test.ts`: both tests passed. Assertions cover active-account HTTP 200/one session and inactive-account HTTP 401/zero sessions. This follows the recorded inactive-account RED failure.
- Inspected owner-edited `src/server/auth.ts`: `databaseHooks.session.create.before` queries current `isActive` and throws `APIError("UNAUTHORIZED")` for inactive/missing users. Agent edited documentation only and checked `git diff --check`.
- Verification is from the owner's supplied test output, not an agent-run test. Full suite, lint, and typecheck results after this change have not been supplied. Existing-session deactivation behavior and broader auth/RBAC coverage remain unverified.

## 2026-10-15 | Owner-confirmed checks after inactive-account hook

- Owner reported `npm test`, `npm run lint`, and `npm run typecheck` all passed following the focused GREEN auth tests. Full output and suite totals were not supplied; no counts inferred and no agent rerun claimed.
- Inspected dashboard account-state check and Prisma configuration. Verified installed Prisma Studio CLI options via `npx.cmd prisma studio --help`; this did not launch Studio or modify data.
- Next guided manual check: deactivate only the development test account while its browser is logged in, reload dashboard to verify rejection, verify fresh login is rejected, then restore account activity. Existing sessions are not automatically revoked by the current creation hook.
- Agent changed documentation only; `git diff --check` checked whitespace. Production build, existing-session deactivation results, and full auth/RBAC readiness are not claimed.

## 2026-10-15 | Owner-confirmed account deactivation/reactivation exercise

- Owner reported the manual exercise matched expectations, explicitly confirming that `isActive=false` prevents login and changing it back to `true` permits login again. The development account was restored per the report.
- Evidence is owner-reported browser testing. The reply did not separately describe refresh of an already authenticated dashboard; no automatic session revocation or broader endpoint protection is claimed.
- Agent updated context/devlog only and ran `git diff --check`; no application tests, browser checks, or database mutations were run by the agent in this step.
- Suggested next guided focus: reusable server-side active-user checks and automated coverage for deactivation with an existing session, before expanding protected pages/actions. Business-role authorization remains separate unfinished work.

## 2026-10-15 | Active-user helper extraction: source inspected, checks pending

- Owner created `src/server/require-active-user.ts` and updated dashboard to call it. Agent inspected both files: session/current-account checks moved into the server-only helper, which returns `id`, `name`, and `isActive` after checks. Dashboard retains its existing UI and logout button.
- Owner confirmed code edits completed. No post-refactor application checks or browser results were reported; previous passing results are historical and do not verify this extraction. Automated coverage of the helper remains a next step.
- Agent edited documentation only and ran `git diff --check`. No application code edits or application test runs by the agent. HEAD remains `c5de801`; helper is untracked.

## 2026-10-15 | Owner-confirmed helper refactor checks

- In response to the requested post-refactor typecheck/lint/full-test commands and browser checks, owner confirmed everything works. Detailed command output/counts were not supplied. Manual cases were authenticated dashboard access and redirect to login after logout.
- Agent re-inspected the helper and existing auth tests. Dedicated automated helper/existing-session deactivation tests are still absent; existing auth tests cover session creation only.
- Agent updated documentation and checked `git diff --check`, without editing application code or running application tests. Next guided step is dedicated helper integration coverage with real Better Auth sessions and isolated test database records.

## 2026-10-15 | Active-user helper integration tests: focused pass

- Owner supplied output for `npx vitest run tests/integration/require-active-user.test.ts`: 2 tests passed. Cases cover redirect without a session and rejection of an existing session after account deactivation.
- Inspected test: authenticates a temporary active user, confirms helper access, deactivates the user, verifies Better Auth still recognizes the same session, and asserts the helper redirects to login. Next.js headers/redirect are mocked as framework boundaries; auth, Prisma, and test DB remain real. Fixtures are cleaned up.
- Evidence is the owner's command output; no agent-run application verification. Full suite/lint/typecheck after adding this file remain pending. Agent edited documentation only and checked `git diff --check`.
- This confirms helper access rejection, not automatic revocation of existing sessions or protection of routes that do not call the helper. No fault-injection run has been performed for this test.

## 2026-10-15 | Owner-confirmed frontend password visibility toggle

- Owner added `showPassword` state, dynamic password/text input type, and a non-submit toggle button with changing Indonesian label, `aria-controls`, and visible keyboard-focus styling in `src/app/login/login-form.tsx`. Agent inspected the source.
- Owner replied that the step works after being asked to check visibility, value preservation, absence of unintended submit, keyboard operation, lint, and typecheck. No detailed results/output were supplied; no agent-run application or browser checks claimed. This does not establish a fresh full-suite result after the helper test addition.
- Frontend-only teaching step; no server behavior changed. Owner wants advance notice before backend work on `feature/frontend` and continues typing application code.
- Agent updated context/devlog only and ran `git diff --check` for documentation whitespace.

## 2026-10-15 | Approved login visual implementation

- Owner explicitly authorized agent code edits and image placement for the approved seamless hotel background, translucent glass, and brown/gold palette. Implemented responsive server-rendered login shell, local CSS Module, decorative background/emblem, Indonesian document language and login metadata. Existing sign-in logic, redirects, and backend behavior retained.
- Browser inspection exposed missing class names: the existing Tailwind Turbopack rule converted CSS Modules to ordinary CSS through `as: '*.css'`. Excluded `*.module.css` from that rule; confirmed actual module class names and rendered layout afterward. No dependency changes.
- Agent verification: lint and typecheck passed; full test suite passed 43/43 tests in 6 files; production build passed. First sandboxed build failed fetching Google Fonts; authorized network-enabled retry succeeded.
- Agent browser verification at desktop 1440x960, tablet 820x1180, and mobile 390x844/320x740: responsive layout and no horizontal overflow at tablet/mobile sizes; empty required-email validation, password visibility type toggle, keyboard focus, pending disabled submit, invalid-credential alert and submit recovery. Successful login/logout and account deactivation were not manually repeated; existing regression tests passed.
- Assets/provenance in `docs/LOGIN-DESIGN.md`. Context updated with approval and actual evidence. Screenshots saved in the conversation visualization directory. No commit created. Next.js refreshed its generated AGENTS block when the development server started; project-specific instructions remain intact.

## 2026-10-16 | Owner-requested smaller login proportions

- Owner authorized direct CSS edits to reduce the current login UI approximately 15%. Scaled panel/column widths, heading sizes, emblem/icons, spacing, and control heights across existing breakpoints in `src/app/login/login.module.css`, preserving the owner's latest edits.
- Desktop panel maximum changed from 420px to 357px; mobile maximum from 440px to 374px. Input text remains 16px, body/form text has a 14px floor, small existing labels/footer remain unchanged, and password-toggle target remains 44px. No page zoom/transform or overflow clipping introduced.
- Agent ran lint and typecheck successfully. No new browser screenshots or visual-fit claims for this adjustment; owner review at 100% browser zoom remains pending. Background crop on mobile remains a separate unresolved visual request.

## 2026-10-16 | Portrait mobile asset prepared

- Owner confirmed the smaller UI is acceptable, then selected a supplied portrait image for a full-screen mobile background with compact glass form. Owner will type application code; agent authorized only to place the image and provide guidance.
- Copied supplied PNG to `public/images/login/hotel-background-portrait.png`; verified source/destination SHA256 match. No application source changed in this step. Responsive picture/getImageProps and compact mobile CSS are proposed, not implemented or tested.

## 2026-10-16 | Owner-confirmed responsive login checks

- Owner supplied typecheck success and initial lint output with one alt-text warning. After guidance to add explicit `alt=""` to the decorative picture fallback, owner confirmed lint is clean.
- Owner then explicitly confirmed all five manual checks: empty-field validation, incorrect-password error/layout, successful login/dashboard navigation, logout/login navigation, and mobile field/submit access with keyboard open.
- Evidence is owner-reported; no new agent browser/test run is claimed. Login presentation accepted for now, including mobile portrait background and form-only layout. Next proposed frontend step is a dashboard shell; operational counts require real domain data and are not yet implemented.

## 2026-10-16 | Impeccable product initialization

- Owner confirmed mixed phone use during operations and computer use at the HK desk, and selected comp-first for future new surfaces.
- Created PRODUCT.md as durable Impeccable context subordinate to PROJECT.md, separating confirmed requirements from implementation evidence and open decisions. Saved buildPath=comp in .impeccable/config.json and configured the existing Next.js layout in .impeccable/live/config.json. Added the context file map pointer.
- Agent verification: product schema/platform/device-context assertions, JSON parsing, selected workflow, live target existence and insertion anchor passed. Impeccable detect-csp returned shape=null and no signals; no CSP change needed. Live mode was not started or browser-tested. No application code changed and no application tests were run.
- Full git diff --check reported existing trailing whitespace in tests/integration/require-active-user.test.ts (lines 74 and 106), outside this task. Existing permission/auth work was preserved. Scoped documentation whitespace check is recorded separately by the completion command.

## 2026-10-16 | RBAC foundation and owner-confirmed access policy

- Inspected permission map and server helper. Existing three action permissions distinguish borrowing creation, inspection verification, and write-off approval. requirePermission calls requireActiveUser and throws PermissionDeniedError on denial; no HTTP 403 mapping or sidebar/page enforcement is established by the helper alone.
- Owner confirmed helper tests work after correcting implementation/test file placement; no new agent-run verification or inferred test totals.
- Owner confirmed Management read-only operational oversight plus its specified approvals; IT account/access administration without implicit business powers; multi-role users; shared IT/admin account acceptable with individual accountability handled by internal process. Recorded these decisions in PROJECT section 3 without relaxing Management-role grant approvals.
- Next guided change is page-view permissions in src/lib/permissions.ts. Application code remains owner-authored. Agent changed documentation only.
## 2026-10-16 | RBAC type-error correction, owner will verify

- Owner supplied typecheck errors and explicitly requested agent edits while reserving test execution for themselves. Added the nine previously agreed page-view permissions missing from src/lib/permissions.ts; retained action permission boundaries. Corrected the unit fixture to isActive: true as const.
- Cleaned integration-test indentation and removed duplicate session/deactivation assertions, retaining no-role denial, role grant/revocation, retained Staff permission, and account-deactivation checks.
- No typecheck or tests executed by agent per owner's request. Source diff inspected; repository whitespace check reported pre-existing trailing whitespace in src/server/require-active-user.ts. Verification remains pending owner execution.

## 2026-10-16 | Owner-confirmed RBAC correction checks

- Owner reported the requested typecheck and focused permission/helper unit and integration test run passed after the previous correction. No full output or totals supplied; no agent rerun claimed.
- Inspected current permission map and tests. Page-view entries exist, but current permission unit tests only cover action permissions. Next guided coverage targets Management read-only access, IT-only administration, no-role denial and combined roles. Actual route enforcement and HTTP denial responses remain pending.

## 2026-10-16 | Owner-confirmed active-user lookup extraction

- Owner confirmed typecheck and focused requirePermission unit / active-user integration tests passed after extracting getActiveUser. Agent inspected current source; no agent-run verification claimed.
- getActiveUser returns current active account/roles or null; requireActiveUser preserves page login redirects. Next guided backend step: an API authorization result with explicit JSON 401/403, without adding an operational endpoint prematurely.

## 2026-10-20 | Resume after owner-confirmed master item API checks

- Inspected feature/backend at 93eac36 (add master item API), following 72dc3ed (role-aware workspace navigation). Working tree was clean before documentation maintenance.
- Owner implemented Item schema/migration, inventory:item:create permission, GET/POST /api/items, normalized-name uniqueness, and transactional creation/audit. Owner reported tests passed after correcting the misplaced test closure; detailed results and totals were not supplied. No fresh agent-run application checks are claimed.
- Frontend includes workspace navigation, access-denied and Administration starter pages, shared logout, and /start role-aware login routing. Owner confirmed frontend checks and development-account role assignment worked.
- Removed three committed merge-marker lines from this devlog while preserving both sets of historical entries. Updated context to current paths and evidence.
- Next guided backend slice: ItemUnit schema and atomic Add Stock. Physical-unit fields/code strategy are proposed guidance, not implemented or verified by this entry.

## 2026-10-20 | ItemUnit relation correction and schema review

- Owner added ItemUnit and enums, then explicitly authorized correction of misplaced inverse relations. Added Item.units and Location.units and removed the accidental ItemUnit self-relation; retained owner work. Owner subsequently reported Prisma commands and tests passed without detailed output/totals.
- Inspected schema and migration 20261020014500_item_units: SERIAL unitNumber with unique index; distinct operational dimensions; foreign keys with deletion restrictions. Agent reran npm run db:validate successfully. No application tests or database migration-state query executed in this review.
- Schema is a foundation for Add Stock. The server must still enforce immutable identifiers, default storage, condition-driven inspection, authorization, atomic audit, and retry handling. Add Stock input contract and permission are the next guided step.

## 2026-10-20 | Send root route directly to login

- Replaced the starter home page with a server-side redirect from `/` to `/login`, as requested. Post-login routing through `/start` remains unchanged.
- Updated `docs/CONTEXT.md` to reflect the root route. Agent ran `npm run typecheck` successfully (exit 0); browser behavior was not independently checked.

## 2026-10-20 | Owner-confirmed Add Stock checks and next inventory read slice

- Owner confirmed the Add Stock checks passed after correcting the test command filename, including integration tests, typecheck and lint. Detailed output/totals were not supplied; no agent rerun claimed.
- Inspected commit 86f0291, current ItemUnit/StockBatch schema and master-item API. Add Stock is committed; root redirect, docs and an owner change in next.config.ts remain uncommitted.
- Next guided step is a paginated per-item unit read service and endpoint with derived total registered count. Readable codes will be formatted from unitNumber. Total registered is not borrowable stock; unresolved borrowing obligations must be included when implementing eligibility.

## 2026-10-20 | Owner-confirmed mutation request guard checks

- Owner reported the requested checks passed after adding missing/untrusted Origin and missing/text-plain Content-Type cases to both inventory mutation integration suites. Detailed output and totals were not supplied; no agent rerun claimed.
- Inspected HEAD 50a317d and the modified integration tests. Both POST routes invoke validateMutationRequest after authorization and before JSON parsing; rejection tests assert no new inventory or audit records.
- Next guided change: bounded JSON body reading for both routes. This remains proposed implementation, not verified behavior.
