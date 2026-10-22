# Item catalog metadata and photo storage

Decision: 22 October 2026. Owner selected name + optional catalog photo + description, with persistent local disk outside public/. This supersedes the earlier name-only frontend scope. PROJECT.md remains business authority.

## Contract and persistence

- Migration `20261022090000_item_catalog_details` adds nullable Item.description and Item.photoKey. Existing rows stay valid; no data reset/backfill is needed. Name normalization/uniqueness and role permissions are unchanged. Creation does not add units.
- POST /api/items accepts the existing application/json body (name, optional description) and new multipart/form-data (name, optional description/photo). Origin validation and inventory:item:create authorization run before body parsing. Other mutation endpoints remain JSON-only by default.
- Name remains 1–100 characters; description trims and permits up to 2000 characters. Empty description becomes null. Duplicate multipart fields are rejected. JSON still has a 256 KiB byte limit; multipart has 2 MiB + 64 KiB total framing/text limit, counted while streaming before form parsing.
- Catalog file limit 2 MiB, static JPEG/PNG/WebP only, maximum decoded input 20 million pixels. Signature is checked independently of supplied MIME/name. Sharp decodes, applies orientation, shrinks inside 1600×1600 without enlarging, and re-encodes WebP85 without preserving EXIF. Corrupt, SVG, animated and oversized inputs are rejected.
- Sharp 0.35.5 was already installed as Next's dependency; it is now declared directly in package.json/lockfile. No package version was downloaded/upgraded. npm ls sharp verifies a deduped installation. Offline lock normalization hit unavailable npm artifacts; required flags for its existing dependency entries were updated locally.
- Files use generated UUID.webp keys, never browser paths/names. Default root is .data/item-photos under project cwd; ITEM_PHOTO_DIR can select an absolute persistent directory. Tests always use .data/test-item-photos, ignoring the production override. .data is excluded from Git.
- File is written before the Item/audit transaction. Failed transactions remove that new file; duplicate-name cleanup is integration-tested. A process crash between file write and DB commit can leave an unreferenced private file. Filesystem and Postgres are not a distributed atomic transaction; no automatic destructive orphan cleanup has been added.
- ITEM_CREATED audit records description and generated photo reference. Existing rename API remains name-only; changing/replacing photo/description on existing items is not implemented by this slice.

## Reads and access

List/unit-detail responses add description and photoUrl (nullable). They do not expose the filesystem root/key as a public URL. GET /api/items/[itemId]/photo checks active-user inventory:view permission, resolves the stored key, and serves image/webp with private,no-store, nosniff and restrictive CSP. Missing item/file returns404. Management may read; System Admin alone has no inventory permission. No publicly accessible static upload folder is created.

Frontend uses next/image unoptimized so browser cookies reach the authorized endpoint; the Next image optimizer must not fetch a private photo without that session. Placeholder remains for items without a photo. Actual images render in the 144px card area and selected-item panel; description appears in that panel.

## Deployment and backups

Deploy on a server with durable writable disk, retaining ITEM_PHOTO_DIR across releases/container recreation. Back up that directory alongside the database so keys and files remain consistent. Restrict directory access to the app/service account; Windows ACLs must be configured by the deployer. Local disk is not a serverless/multi-instance storage solution. A later deployment requiring those environments needs an explicitly selected shared/object storage migration.

After pulling this schema change elsewhere, run db:generate and db:migrate; restart an existing dev server so its global Prisma singleton reloads the new client. Test database uses db:migrate:test and must stay separate from dev. In this session migrations were applied to both databases: dev also had pending deactivation/GuestVisit migrations, which migrate deploy applied without resetting existing records.

Verification: tests/integration/item-catalog.test.ts exercises real test DB + disk + private image endpoint, old JSON compatibility, cleanup, role checks and invalid uploads. tests/unit/read-item-form.test.ts checks bounded stream cancellation. Browser tests use route interception for successful creates/stock batches, avoiding fixture writes to the development database; this is distinct from actual persisted API integration verification.
