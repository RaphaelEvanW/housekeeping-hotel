# Development History

`PROJECT.md` is the business source of truth. This log records completed implementation steps and verified technical results. Entries contain no credentials or tokens.

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
