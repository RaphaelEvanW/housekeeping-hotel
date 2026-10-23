# Runtime transaction query serialization

Decision: 23 October 2026. Owner authorized a narrowly scoped BE fix for the pg overlapping-query deprecation warning; database schema, API contracts and business rules remain unchanged.

## Evidence

Installed runtime: Prisma/adapter-pg 7.10.0, pg 8.23.1. A read-only invocation of listItemDeactivationRequests reproduced the warning through PgTransaction.queryRaw. A second read-only probe awaited findMany before count and still reproduced it inside the relation read. Therefore merely replacing application Promise.all or the array transaction would not address all overlapping relation queries.

In the installed pg client, a further query submitted to a client with an existing queue emits the deprecation warning. Prisma's relation query interpreter can submit these queries within one transaction. The current pg client queues them; future pg versions warn that this implicit behavior will be removed. This is not evidence of a failed query or corrupted data.

## Implementation

src/server/serialized-prisma-pg.ts extends the installed PrismaPg factory through its public connect/startTransaction methods. Each new transaction gets its own promise queue shared by queryRaw and executeRaw. Each caller receives its original result/rejection; the queue tail handles rejection so later rollback statements can still execute. Savepoint methods continue using the transaction's executeRaw method.

src/server/db.ts uses this factory. Pool configuration, connection count, transaction isolation, locks, transaction boundaries and application query shapes are preserved. Separate pool connections/transactions remain parallel. No dependency update, warning suppression, migration, query rewrite or data write was needed.

Revisit this small compatibility adapter when upgrading Prisma/pg; remove it only after the same relation-read probe and transaction tests establish compatible behavior without it. Do not patch node_modules.

## Verification and rollout

A fresh-process read-only repeat of the request-list and unit-history services completed with zero overlapping-query warnings after the change. The request list was empty in that probe; no fixture or development data was created. This does not verify every mutation, rollback or concurrency path.

tests/unit/serialized-prisma-pg.test.ts covers single-transaction query ordering, original error propagation with a later rollback statement, and independent transactions remaining concurrent. Owner runs these checks and the full integration suite; agent did not run npm lint/typecheck/tests.

Restart the development server after this change: db.ts preserves the Prisma client on globalThis, so hot reload can retain the previous adapter. Production starts with a fresh process as usual. No db:generate or migration is required.
