# Hotel Housekeeping

Standalone Next.js application. Business rules live in [PROJECT.md](PROJECT.md).

## Local setup (Phase 1, Steps 1–2)

Requirements: Node.js 24 LTS, npm, Docker Desktop with Linux containers and Docker Compose v2.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` if `.env` does not already exist. The example credentials are for local containers only. Keep the passwords and corresponding URLs consistent.
3. Start Docker Desktop, then run `npm run db:up`.
4. Run `npm run db:generate` to generate the Prisma client.
5. Run `npm run db:migrate`, then `npm run db:seed` for the development database.
6. Run `npm run db:migrate:test` for the isolated test database.
7. Run `npm run dev` and open <http://localhost:3000>.

The existing Next.js starter page is still the application entry point.

| Service | Host address | Database/user | Storage |
| --- | --- | --- | --- |
| Development | `127.0.0.1:5433` | `housekeeping_dev` | Named Docker volume |
| Test | `127.0.0.1:5434` | `housekeeping_test` | Temporary container storage |

Ports are bound to loopback. `npm run db:stop` stops both containers without removing the development volume. Test data is disposable and is lost when its container stops. Changing a password in `.env` does not change credentials in an already initialized development volume.

On Windows, if `docker` resolves to an empty/shadowing command, use Docker Desktop's actual executable or put its directory first in the current terminal's PATH:

```powershell
$env:Path = "C:\Program Files\Docker\Docker\resources\bin;" + $env:Path
npm run db:up
```

## Checks

```sh
npm run db:generate
npm run db:validate
npm run db:migrate:test
npm run lint
npm run typecheck
npm test
```

`npm run test:unit` runs environment validation tests without a running database. `npm run test:integration` requires the test container and applied migrations. Run `npm run db:migrate:test` again after restarting the disposable test container. Missing configuration, missing tables, or an unavailable database fails the suite; integration tests are never silently skipped.

`npm run typecheck` generates Next.js route types before running TypeScript. Generate the Prisma client after installation and whenever the Prisma schema changes, including before a clean build (`npm run build`). Generated client files are ignored by Git and ESLint.

## Environment and database boundary

- Next.js loads environment files itself. Prisma CLI and Vitest use the matching `@next/env` loader. Existing process environment values take precedence. Next.js test mode ignores `.env.local`; use `.env` or `.env.test.local` for test configuration.
- `src/server/env.ts` validates PostgreSQL URLs without including credentials in validation errors.
- `src/server/db.ts` is marked `server-only`, uses Prisma's PostgreSQL driver adapter, and reuses its client across development hot reloads. Pool connection timeout is five seconds.
- With `NODE_ENV=test`, the client requires `TEST_DATABASE_URL`. It never falls back to `DATABASE_URL`.
- Test URLs must use a loopback host, database and user `housekeeping_test`, and no query parameters. Development and test targets must differ, even if their credentials differ. Use the same local test service in CI.
- The connection test verifies the database/user before creating a uniquely named probe table, then tests commit/rollback and removes only its own table. Foundation/seed fixtures run inside rolled-back transactions; they do not reset or truncate existing data.
- Vitest maps the `server-only` marker to its React-server entry for Node execution. This does not replace or mock the Prisma client/database, and does not alter Next.js's server/client boundary enforcement.

## Technical choices and scope

PostgreSQL 17 runs in separate development/test containers. Prisma 7.10.0 uses the `prisma-client` generator and `@prisma/adapter-pg`; configuration lives in `prisma.config.ts`. Vitest 4.1.11 preserves compatibility with the repository's existing Node type definitions. Zod validates environment input.

### Foundation schema and reference seed

The first migration creates `user`, `session`, `account`, `verification`, `role`, `user_role`, `location`, and `audit_event`. Better Auth **1.7.7** is pinned; the auth fields were checked against the installed package's `getAuthTables` and exercised through its real Prisma adapter. No auth instance, HTTP endpoints, or login flows are configured yet.

- Auth IDs are opaque strings, compatible with library-generated IDs. Auth fields keep their standard names; database tables use Prisma `@@map`.
- `User.isActive` is available for later authentication enforcement; its presence alone does not enforce access control.
- `Role.code` uses the four-value `RoleCode` enum. `UserRole` has a composite primary key. There is no role hierarchy or automatic business authority for SYSTEM_ADMIN.
- `Account` additionally enforces uniqueness of `(providerId, accountId)`; session tokens and user emails are unique. Verification identifiers are indexed, not unique, matching the library's ability to keep multiple records per identifier.
- Timestamps use `timestamptz(3)`. Prisma maintains `updatedAt` on application writes; raw SQL updates must set it explicitly.
- Audit actors reference existing users with restrictive deletion/update behavior. Audit targets are generic `entityType`/`entityId` references, not foreign keys to operational tables. JSON old/new values are for selected non-secret fields. The audited mutation writer and append-only access controls belong to later steps; this schema alone does not prevent a database owner from editing audit rows.
- `HK_MAIN_STORAGE` is the stable reference code for the default location. No separate default-location flag or selection workflow is needed.

`npm run db:migrate` applies reviewed, versioned migrations to `DATABASE_URL`. `npm run db:migrate:test` explicitly selects test mode, validates the isolated target, and runs the same migrations against `TEST_DATABASE_URL`. Both use `prisma migrate deploy`, without resetting databases. For future schema changes, use `npx prisma migrate dev --name <change> --create-only`, review SQL, then apply it. Do not edit a migration already applied to a shared database.

`npm run db:seed` runs the reference seed in one transaction. It inserts missing role codes and HK Main Storage with conflict-safe inserts. Repeated runs preserve IDs, edited labels, active flags, and role assignments. It never creates users, credentials, or demo transactions. `tsx` is a development dependency to execute TypeScript seed/migration tooling; the seed uses Node's React-server condition to import the existing server-only database module.

Implementation history and verified checks are recorded in [docs/DEVLOG.md](docs/DEVLOG.md). `PROJECT.md` remains the business source of truth.
