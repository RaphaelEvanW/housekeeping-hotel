
<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data.

Before writing any Next.js code, read the relevant documentation in `node_modules/next/dist/docs/`.

Follow the installed Next.js version's documentation and heed deprecation notices.

<!-- END:nextjs-agent-rules -->

---

# AGENTS.md — Hotel Housekeeping Web Application

> Project-specific instructions for AI coding agents (including OpenCode).
> **If `AGENTS.md` already exists in the repository, APPEND/MERGE these rules into it. Do not overwrite or delete any Next.js-generated agent instructions.**
> Product requirements and business rules live in [`PROJECT.md`](./PROJECT.md).

## 1. Mission and source of truth

Build a maintainable **independent Next.js web application** for hotel Housekeeping inventory, guest borrowing, and item returns.

Before making changes:
1. Read this file and `PROJECT.md` in full.
2. Inspect `package.json`, the existing `src/` tree, configuration, and relevant code.
3. Check the installed Next.js/React versions; use documentation and conventions appropriate to those versions, including any Next.js-generated agent rules already in this file.
4. Distinguish **confirmed business requirements** from **proposals/open decisions** in `PROJECT.md`.
5. Check the latest relevant entries in `docs/DEVLOG.md` before continuing development, and append a concise, verified entry after each completed development step. `PROJECT.md` remains the business source of truth; never record secrets in the devlog.

**Priority:** Explicit user instructions for the current task take precedence over prior implementation plans. If a requested change would alter a confirmed business rule, identify the conflict and propose a corresponding update to `PROJECT.md` rather than silently changing behavior.

## 2. Hard project boundaries

- The **Next.js web app and the AppSheet app are separate products running in parallel**. Do **not** connect their APIs, share their database, synchronize records, or copy live data between them.
- The existing AppSheet project is a **business-workflow reference**, not a technical dependency or schema to copy blindly.
- Do not add hotel PMS, payments, external integrations, multi-property support, or reporting modules unless explicitly requested.
- Do not invent missing requirements, role permissions, database credentials, or production services.

## 3. Development workflow

For non-trivial tasks, follow this sequence:

1. **Understand:** Briefly restate the goal and inspect relevant files.
2. **Plan:** Give the smallest viable approach, likely files to touch, and any risks or unresolved decisions.
3. **Implement:** Make a focused change for **one feature/vertical slice** at a time.
4. **Verify:** Run applicable checks and test the affected behavior; state what actually ran and what could not be run.
5. **Explain:** Summarize important changes, reasoning, remaining limitations, and a useful next step.

When the user asks for **analysis, planning, or review only**, do not edit files, add dependencies, run migrations, or create commits.

If a missing decision blocks correct implementation, offer a concise recommendation with alternatives. Do not silently choose irreversible business rules or major infrastructure components.

## 4. Coding conventions

- Use the repository's existing **Next.js App Router**, **TypeScript**, **Tailwind CSS**, ESLint, and `src/` conventions where present.
- Prefer Server Components for server-rendered UI; use Client Components only when browser-side interaction is required.
- Keep server-only database access, secrets, and privileged logic off the client.
- Use Route Handlers or Server Actions based on the use case; do not introduce a separate Express server by default.
- Separate UI, validation, domain logic, and data access when complexity warrants it. Avoid giant route handlers and giant components.
- Use descriptive, consistent naming. Prefer explicit types; avoid `any` unless justified.
- Favor simple, readable solutions over extra abstraction, speculative scalability, or unnecessary packages.
- Inspect existing dependencies before proposing new ones; explain what each new package solves.
- Respect established design patterns and configuration. Do not enable React Compiler or Cache Components just for optimization without a demonstrated need and approval.
- Never leave fabricated sample data disguised as real production data.

## 5. Domain invariants — must remain correct

These constraints come from `PROJECT.md` and outrank UI convenience:

- `Items` represents **item types**; `ItemUnits` represents **individual physical units**. Do not merge them into a single stock counter.
- Inventory totals are **derived from physical unit records** and their statuses.
- `Add New Item Type` and `Add Stock to Existing Item` are distinct operations. Prevent duplicate item types caused by capitalization or whitespace variations, subject to the agreed uniqueness scope.
- Borrowability is derived from lifecycle, custody, readiness/holds, lost/missing state, and unresolved borrowing obligations as defined in `PROJECT.md`. A unit cannot belong to two unresolved active borrowing lines.
- Recheck availability **on the server**; UI filtering is insufficient.
- Borrowing, returning, and status transitions must be **atomic** and safe against concurrent requests. Use database transactions and suitable constraints/locking for the chosen persistence layer.
- Support **partial returns**. Returning one unit must not mark the entire borrowing complete while other units remain outstanding.
- Reject duplicate returns. Map return condition to unit status as specified in `PROJECT.md`.
- Keep **lifecycle**, **custody/location**, **physical condition**, **readiness/holds**, and **borrowing obligation** separate. `LOST`/`MISSING` are operational states/events, not physical conditions; settlement/recovery must not fabricate a physical return.
- Avoid the AppSheet reference bug where a borrowing displays `Returned` but the stored operational state still says `Borrowed`. Define one consistent canonical/effective state model.
- Keep historical transactions accessible even when guests check out or item types become inactive.

Do not change these rules merely to make a screen easier to implement.

## 6. Data and security

- Database/ORM/authentication/hosting choices are **not finalized** in `PROJECT.md`; recommend before installing/configuring them.
- Once agreed, use versioned migrations for schema changes and transactions for coupled state changes.
- Validate and authorize on the server for every mutation. Do not trust status, stock counts, user IDs, or permissions provided by the browser.
- Define who may perform an action before exposing it as a production feature. UI hiding is not authorization.
- Use environment variables for secrets, never commit `.env*` values or tokens, and never expose secrets via `NEXT_PUBLIC_` variables.
- Avoid logging guest personal data unnecessarily. Treat photos and guest records as sensitive operational data.
- Do not run destructive commands, reset databases, drop tables, or overwrite live data without explicit authorization.

## 7. Testing and quality gates

Before declaring a feature complete:

- Check relevant `package.json` scripts, and run available lint, type-check, and focused tests.
- Do not claim checks passed if they were not executed.
- For inventory flows, prioritize tests for duplicate item names, stock derivation, double borrowing, concurrent requests, partial returns, double returns, and condition-driven status transitions.
- Cover loading, empty, validation, error, and success states in affected UI.
- Do not paper over TypeScript or ESLint errors by suppressing rules without explanation.
- Keep changes scoped; do not refactor unrelated modules or change dependencies/configuration casually.

## 8. Communication and documentation

- Communicate with the project owner in **Indonesian**, with straightforward technical explanations. Code identifiers and technical documentation may remain in English.
- Explain *why* a design or implementation is appropriate, not only what code was generated; support the owner's learning of Next.js and backend concepts.
- Before significant implementation, list the files expected to change; afterward, summarize files changed and actual verification results.
- Update `PROJECT.md` when a requirement/decision is explicitly confirmed or changed. Do not quietly rewrite specifications to match implementation.
- When technical decisions become final, record them in a short decision note or a dedicated technical design file rather than expanding `AGENTS.md` into an architecture document.
- Preserve and follow any existing Next.js-specific autogenerated `AGENTS.md` sections; do not delete them during edits.

## 9. Initial delivery order

Unless the user specifies otherwise, follow the milestones in `PROJECT.md`:

1. Inspect starter repository and propose architecture/data model (**no implementation until reviewed**).
2. Implement item master data and physical unit inventory.
3. Implement guest borrowing with transactional availability enforcement.
4. Implement partial/full returns with consistent statuses.
5. Implement dashboard, history, usability improvements, and hardening.

**Default behavior on first read:** Analyze the repository and propose the next smallest step. Do **not** build the entire application in one pass.
