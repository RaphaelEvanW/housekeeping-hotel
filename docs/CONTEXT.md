# Housekeeping working context

Last verified: 2026-10-15. HEAD: `c5de801` (`set up auth`). Check current status before editing; existing owner work is uncommitted.

## Scope and preferences

- Business source of truth: `PROJECT.md`; instructions: `AGENTS.md`; historical evidence: `docs/DEVLOG.md`.
- Impeccable product context: `PRODUCT.md` (initialized 2026-10-16). Owner confirmed mixed phone/desk-computer use. Workflow default is stored only in `.impeccable/config.json`; live injection target is configured in `.impeccable/live/config.json`, but live mode has not been launched or browser-verified.
- Owner normally types application code with step-by-step Indonesian guidance. Explicitly authorized agent implementation and local image assets for this login redesign.
- Owner says branch is `feature/frontend`; notify before backend work. This redesign changed frontend only, including the CSS-loader configuration.
- Antislop mode `during` was selected for this conversation. Approved visual direction: continuous warm hotel photo, translucent champagne glass form, espresso/brown typography and antique-gold accents. Earlier Ringkas/Dua kolom drafts are superseded.
- Do not commit, discard prior changes, or expand into backend/RBAC work without corresponding scope.

## Current implementation

- Next.js 16.4.0, React 19.3.0, Prisma 7.10.0, Better Auth 1.7.7, Tailwind 4, Vitest 4.1.11. Read installed Next docs before version-sensitive changes.
- Better Auth email/password setup: `src/server/auth.ts`; client: `src/lib/auth-client.ts`; handler: `src/app/api/auth/[...all]/route.ts`. Sign-up disabled.
- Auth session-create hook rejects inactive/missing users. `src/server/require-active-user.ts` rechecks current account activity before protected dashboard access. Existing sessions are not automatically revoked; future endpoints need their own authorization. RBAC unfinished.
- `src/app/login/page.tsx` is the server-rendered visual shell; `login-form.tsx` handles submit, errors, pending state, password visibility, and successful redirect via `window.location.replace('/dashboard')`.
- `src/app/login/login.module.css` owns responsive visual styling. Background/emblem assets: `public/images/login/`; provenance/design notes: `docs/LOGIN-DESIGN.md`.
- `next.config.ts` excludes `*.module.css` from the Tailwind loader rule: its `as: '*.css'` otherwise discards module class exports. Browser repro showed all login class attributes missing before this fix.
- Root language is Indonesian. Login overrides page metadata. Existing auth and dashboard behavior was preserved.
- Dashboard has logout through `authClient.signOut()`.

## Verified evidence

- Owner previously confirmed wrong/correct-password login, session response, dashboard access/anonymous redirect, logout, inactive login denial and restored-active login success, and password visibility.
- Owner supplied passing auth integration output (2 tests) and active-user helper output (2 tests). These owner reports remain separate from agent verification.
- Agent ran on 2026-10-15 after redesign: lint passed; typecheck passed; full `npm test` passed 43 tests across 6 files; production build passed.
- Initial sandboxed build failed downloading Google Fonts. Authorized network-enabled retry passed; fonts were not replaced or mocked.
- Agent browser checks: rendered desktop 1440x960, tablet 820x1180, mobile 390x844 and 320x740; no horizontal overflow at checked tablet/mobile widths. Empty email validation, password show/hide type, visible keyboard focus, pending disabled submit, invalid-credential error and button recovery observed.
- Successful login/logout and account deactivation were not re-run manually by the agent during redesign; regression tests passed. Cross-browser and real-device accessibility checks remain unperformed.

## File map and boundaries

| Area | Entry points |
| --- | --- |
| Login UI | `src/app/login/`, `public/images/login/`, `docs/LOGIN-DESIGN.md` |
| Auth and dashboard | `src/server/auth.ts`, `src/server/require-active-user.ts`, `src/lib/auth-client.ts`, `src/app/api/auth/[...all]/route.ts`, `src/app/dashboard/` |
| Dev account setup | `scripts/create-dev-user.ts` |
| Database | `prisma/schema.prisma`, `prisma/migrations/`, `src/server/db.ts`, `src/server/env.ts`, `compose.yaml` |
| Verification | `tests/integration/`, `tests/unit/`, `vitest.config.mts`, `package.json` |

- PostgreSQL development/test services are separate; test DB port 5434. Never substitute development DB for integration tests. Do not read or record secrets.
- Preserve physical-unit inventory, atomic borrowing/returns, partial returns, separate lifecycle/custody/condition/holds/obligations, and independence from AppSheet.
- PROJECT technology proposals can lag implemented code; do not silently rewrite confirmed business rules.
- Historical dependency-audit findings are in DEVLOG; no fresh dependency audit was run.
- Latest work is ready for owner visual review at `/login`; no new milestone is implicitly authorized.

## Latest adjustment: 2026-10-16

- Owner authorized direct CSS sizing edits: approximately 15% smaller current login proportions at all existing breakpoints (desktop panel 420px to 357px). Input font retained at 16px and toggle target at 44px. Lint/typecheck passed; visual confirmation pending. Mobile background crop remains unresolved. Owner normally resumes typing code after this specific authorized edit.

- Owner subsequently confirmed smaller UI is acceptable. Mobile direction now approved: supplied portrait photo full-screen plus compact glass form. Asset prepared at `public/images/login/hotel-background-portrait.png` (verified identical copy). Owner will write suggested application changes; portrait switching is not implemented yet.

## Owner confirmation: 2026-10-16

- Supersedes the pending mobile notes above: owner implemented portrait switching and mobile form-only presentation, fixed explicit decorative image alt, and confirmed lint/typecheck plus all five requested login/manual mobile-keyboard checks pass. This is owner-reported evidence, not a new agent test run. Login UI accepted for now. Next proposed work: guided frontend dashboard shell; no operational metrics or backend work authorized by this confirmation alone.

## RBAC checkpoint: 2026-10-16

- Owner is working on feature/backend. Inspected src/lib/permissions.ts (three action permissions) and src/server/require-permission.ts; owner confirmed helper tests work after file-placement correction. No fresh agent-run tests. Helper alone does not yet protect pages/endpoints or map denial to HTTP 403.
- PROJECT section 3 now records confirmed Management operational read access, IT account/access administration, multiple roles, and permitted shared admin account with account-level audit. Management-role grant approvals still apply. Next: owner adds page-view permissions, then tests and sidebar/server integration.
