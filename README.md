# Hotel Housekeeping

Standalone Next.js application. Business rules live in [PROJECT.md](PROJECT.md).

## Local setup (Phase 1, Step 1)

Requirements: Node.js 24 LTS, npm, Docker Desktop with Linux containers and Docker Compose v2.

1. Install dependencies with `npm ci`.
2. Copy `.env.example` to `.env` if `.env` does not already exist. The example credentials are for local containers only. Keep the passwords and corresponding URLs consistent.
3. Start Docker Desktop, then run `npm run db:up`.
4. Run `npm run db:generate` to generate the Prisma client.
5. Run `npm run dev` and open <http://localhost:3000>.

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
npm run lint
npm run typecheck
npm test
```

`npm run test:unit` runs environment validation tests without a running database. `npm run test:integration` requires the test container. Missing configuration or an unavailable database fails the suite; integration tests are never silently skipped.

`npm run typecheck` generates Next.js route types before running TypeScript. Generate the Prisma client after installation and whenever the Prisma schema changes, including before a clean build (`npm run build`). Generated client files are ignored by Git and ESLint.

## Environment and database boundary

- Next.js loads environment files itself. Prisma CLI and Vitest use the matching `@next/env` loader. Existing process environment values take precedence. Next.js test mode ignores `.env.local`; use `.env` or `.env.test.local` for test configuration.
- `src/server/env.ts` validates PostgreSQL URLs without including credentials in validation errors.
- `src/server/db.ts` is marked `server-only`, uses Prisma's PostgreSQL driver adapter, and reuses its client across development hot reloads. Pool connection timeout is five seconds.
- With `NODE_ENV=test`, the client requires `TEST_DATABASE_URL`. It never falls back to `DATABASE_URL`.
- Test URLs must use a loopback host, database and user `housekeeping_test`, and no query parameters. Development and test targets must differ, even if their credentials differ. Use the same local test service in CI.
- Integration tests verify the connected database/user before creating a uniquely named probe table, then test commit/rollback and remove only their own table. No application schema is needed.
- Vitest maps the `server-only` marker to its React-server entry for Node execution. This does not replace or mock the Prisma client/database, and does not alter Next.js's server/client boundary enforcement.

## Technical choices and scope

PostgreSQL 17 runs in separate development/test containers. Prisma 7.10.0 uses the `prisma-client` generator and `@prisma/adapter-pg`; configuration lives in `prisma.config.ts`. Vitest 4.1.11 preserves compatibility with the repository's existing Node type definitions. Zod validates environment input.

The Prisma schema currently declares only the generator and datasource. The migration path is configured for Step 2; no migrations, seed data, authentication, roles, or business tables are implemented in Step 1. `PROJECT.md` remains the business source of truth.
