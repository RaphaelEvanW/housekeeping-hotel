# Hotel Housekeeping — Web Application Project Specification

> Status: Initial specification (v0.1)  
> Purpose: Source of truth for product scope and business rules during Next.js development with OpenCode.  
> Reference: Existing AppSheet housekeeping workflow, **not** its infrastructure.

## 1. Project overview

Build an independent, full-stack web application for a hotel's Housekeeping team to manage loanable items, physical inventory units, guest borrowing, and returns. The project recreates the **business workflows** of the existing AppSheet application in a custom web experience, with room to improve usability and maintainability.

**Critical boundary:** The web application and AppSheet application must operate **in parallel as separate systems**. They must not share databases, synchronize records, call each other's APIs, or rely on each other for core functions. Both may be demonstrated side by side; matching workflows do not mean their data must match.

## 2. Goals and non-goals

### Goals
- Centralize housekeeping item types and track **individual physical units**.
- Show accurate available, borrowed, maintenance, and lost inventory counts.
- Record which guest borrows each physical unit and when.
- Support multiple units in one borrowing transaction, including partial returns.
- Record item condition and supporting photos at handover and return.
- Offer straightforward workflows for **Add New Item Type** versus **Add Stock**.
- Deliver a responsive, clear web UI suitable for hotel operations.
- Establish a clean, documented, testable codebase that can be developed feature by feature.

### Non-goals (initial scope)
- Migrating or importing AppSheet data.
- Integrating with or replacing the AppSheet application.
- Real-time synchronization with AppSheet or Google Sheets.
- Payment, billing, PMS integrations, or cross-property operations unless explicitly requested.
- Complex forecasting, procurement, or accounting modules.

## 3. Users and permissions

Primary users are Housekeeping staff and supervisors. The exact roles and permission matrix are **not yet confirmed**. Until agreed, design access checks as a capability that can be added safely; do not invent production credentials or assume all users are administrators.

Potential permissions to finalize: view stock, create borrowing, process returns, maintain master data, view audit history, and manage users.

## 4. Core domain model

**Distinction that must never be lost:**
- `Items` = **item types** (for example, *Hair Dryer*).
- `ItemUnits` = **individual physical assets** belonging to an item type (for example, `HD-001`, `HD-002`).

A single item type can have many physical units. Stock is derived from units, **not** from manually editable counters or the number of item names.

### 4.1 Confirmed AppSheet-reference entities

| Entity | Purpose | Known fields / reference notes |
|---|---|---|
| `Items` | Master catalog of item types | `ItemID`, `ItemCode`, `ItemName`, `CategoryID`, `Description`, `IsActive`, `CreatedAt` |
| `ItemUnits` | Physical units | `ItemUnitID`, `ItemID`, `UnitCode`, `SerialNumber`, `LocationID`, `ConditionID`, `Status`, `Notes`, `CreatedAt`, `UpdatedAt` |
| `Borrowings` | Borrowing transaction header | `BorrowingID`, `BorrowingCode`, `GuestID`, `CreatedBy`, `BorrowedAt`, `ReturnedAt`, `Status`, `Notes`, `CreatedAt`, `UpdatedAt` |
| `BorrowingItems` | Individual units in each borrowing | `BorrowingItemID`, `BorrowingID`, `ItemUnitID`, `InitialConditionID`, `ReturnConditionID`, `ReturnedAt`, `ReturnedBy`, `Notes`, `Status` |
| `Guests` | Guest information for borrowing | `Status = STAYING` is used to select guests for **new** borrowings; other fields require confirmation |
| `Returns` | Return transaction header | Exists in reference workflow; exact fields require confirmation |
| `ReturnItems` | Items processed as part of a return | Exists in reference workflow; exact fields require confirmation |
| `ItemCategories` | Categorization for item types | Exact fields require confirmation |
| `ItemConditions` | Physical condition master | Known codes listed below; other fields require confirmation |
| `Locations` | Storage / operational locations | Exact fields require confirmation |

The table and column names above describe the reference business domain, **not a mandate** to duplicate AppSheet's physical schema verbatim. Propose a normalized relational model before implementation. Do not silently invent unspecified legacy fields.

### 4.2 Known unit status and condition codes

**Physical unit status:** `AVAILABLE`, `BORROWED`, `MAINTENANCE`, `LOST`.

**Physical condition:** `GOOD`, `MINOR_DAMAGE`, `DAMAGED`, `MISSING_PART`, `LOST`.

Status describes **availability / workflow**; condition describes **physical quality**. Keep them separate. A unit can be damaged while under maintenance; do not use the two fields interchangeably.

### 4.3 Entity relationships (conceptual)

```text
ItemCategories 1 ── * Items 1 ── * ItemUnits
                              │
                       * BorrowingItems * ── 1 Borrowings * ── 1 Guests
                              │
                     ReturnItems / Returns (return history)

ItemConditions 1 ── * ItemUnits
Locations      1 ── * ItemUnits
```

Final return relationships and photo storage models must be established during database design, rather than guessed from this sketch.

## 5. Inventory rules

1. **Available stock** for item type X = count of its `ItemUnits` with `Status = AVAILABLE`.
2. **Borrowed stock** = count with `Status = BORROWED`.
3. **Maintenance stock** = count with `Status = MAINTENANCE`.
4. **Lost stock** = count with `Status = LOST`.
5. **Total registered units** = count of all units for the type (subject to a future decision on archived/deleted units).
6. Only an `AVAILABLE` unit may be selected for a new borrowing.
7. No physical unit may be part of two simultaneously active, unreturned borrowing lines.
8. Inventory changes happen as a consequence of controlled unit operations, not free-form edits to a stock number.
9. Changes that affect borrowing/return records and unit status must be **atomic** (database transaction) to prevent inconsistent stock.
10. The system must revalidate unit availability on the server before saving, even if the UI already filters it.

### 5.1 Master item naming and duplicate prevention

Staff must not accidentally create separate master types due to capitalization or extra whitespace, e.g., `Hair Dryer`, `hair dryer`, and `Hair  Dryer`.

- Use a searchable selection of existing item types for **Add Stock**.
- Normalize names for duplicate checks (trim, collapse whitespace, compare case-insensitively).
- Prevent or flag duplicate item types at the server/database level; offer selection of the existing master instead.
- Preserve a properly formatted display name rather than overwriting it with a normalized key.
- Define the exact uniqueness scope (name-only versus name + category) before locking the database constraint.

## 6. Main functional modules

### 6.1 Dashboard

Show concise operational summaries such as available units, borrowed units, units under maintenance, lost units, and active borrowing transactions. Provide links to relevant filtered lists. Exact KPI layout is a UI decision, not a fixed AppSheet clone.

### 6.2 Item types (master catalog)

- List, search, filter, and view item types.
- Create a new type with its code, name, category, description, and active flag as appropriate.
- Show the calculated unit counts per type.
- Provide a clear **Add Stock** action for an existing type.
- Handle inactive types without accidentally deleting historical transactions.

### 6.3 Physical units / add stock

- Add one or more physical units under an existing `Item`.
- Capture unit code, optional serial number, location, condition, and notes as applicable.
- Ensure unit codes are unique under the agreed identifier policy.
- Unit creation and current status must follow validated operational rules.
- Keep **Create Item Type** and **Add Stock** as two distinct actions in the interface, even if reachable from the same inventory page.
- Do not treat a stock addition as a new `Items` record when the item type already exists.

### 6.4 Guest management

- Maintain the minimum guest data required to identify borrowers.
- New borrowings may select guests with `Status = STAYING`.
- Existing borrowings and returns remain accessible even after a guest checks out; changing guest status must not hide outstanding returns.
- Decide later whether guests are entered manually or sourced from another internal source; no integration is assumed.

### 6.5 Borrowing transaction

1. User creates a borrowing and selects the guest (and room where modeled).
2. User adds one or more **specific, available** item units.
3. User records the initial item condition and optional supporting handover photos.
4. On save, create borrowing header and unit detail records.
5. Atomically mark the selected physical units `BORROWED`.
6. Show a readable borrowing code, borrower, timestamps, included units, and current state.

Do not allow duplicate selection of the same unit in a single transaction. Never rely on a client-side stock check alone.

### 6.6 Return transaction (including partial returns)

1. Open an existing borrowing with outstanding unit lines.
2. Select one or more outstanding borrowed units to return.
3. Record return condition, timestamp, operator, and supporting photos where applicable.
4. Create the return transaction/history and mark **only those** borrowing lines as returned.
5. Map condition to unit availability according to the following reference rule:

| Return condition | Resulting unit status |
|---|---|
| `GOOD` | `AVAILABLE` |
| `MINOR_DAMAGE` | `MAINTENANCE` |
| `DAMAGED` | `MAINTENANCE` |
| `MISSING_PART` | `MAINTENANCE` |
| `LOST` | `LOST` |

6. A partially returned borrowing remains outstanding for its remaining lines.
7. When all lines are returned, the borrowing's **effective/display status** is `RETURNED` and its completion timestamp should be recorded.
8. The same line must not be returned twice; server-side checks and transactions are mandatory.

**Known reference issue to avoid:** In AppSheet, a returned borrowing could display `Returned` through `StatusTampilan` while the stored header `Status` remained `Borrowed`. For the web app, define one consistent canonical state model with computed effective status or synchronized persisted state. Never leave UI status and operational logic contradictory.

### 6.7 Search, history, and traceability

Support finding transactions by borrowing code, guest, unit, and status. Keep historical borrowing and return events even when a master item becomes inactive. Capture relevant operators and timestamps; never rewrite past borrowing details simply because current item status changes.

## 7. User experience principles

- Prioritize desktop usability **and** tablet/mobile responsiveness for hotel staff.
- Use clear navigation: Dashboard, Inventory, Borrowings, Returns/History, and Masters/Settings as the permissions allow.
- Make unit availability obvious before selection.
- Use consistent status labels and avoid exposing internal IDs as primary display text.
- Give useful validation messages and loading/empty/error states.
- Require confirmation for destructive or irreversible operations.
- Prefer task-oriented forms over large, confusing all-fields-at-once forms.
- UI language is tentatively Indonesian; exact copy and branding are to be decided.

## 8. Technical direction (proposed, not yet locked)

| Concern | Starting point | Decision status |
|---|---|---|
| Web framework | Next.js, App Router | Chosen |
| Language | TypeScript | Chosen during project setup |
| Styling | Tailwind CSS | Chosen during project setup |
| Backend | Next.js server-side code / Route Handlers / Server Actions as appropriate | Proposed architecture |
| Database | PostgreSQL (independent from AppSheet data) | **Needs confirmation** |
| ORM | Prisma or Drizzle | **Needs confirmation** |
| Authentication / roles | To be designed | **Needs confirmation** |
| Photo storage | Private object/file storage with controlled access | **Needs confirmation** |
| Hosting | To be decided | **Needs confirmation** |

Security baseline: validate input on the server, authorize every state-changing operation, protect uploads, keep secrets in environment variables, and never trust client-submitted stock or status. Never expose database credentials in browser code. Do not add dependencies without a clear use case.

## 9. Delivery plan

| Phase | Output | Acceptance checkpoint |
|---|---|---|
| 0 — Foundation | Repository review, project conventions, schema proposal, environment setup | Architecture and schema are reviewed before migrations |
| 1 — Master data | Item types, categories, conditions, locations, physical units | Adding existing stock increases the correct item type's unit count |
| 2 — Borrowings | Guest selection, borrowing form, multiple unit lines | Borrowing changes only selected `AVAILABLE` units to `BORROWED` |
| 3 — Returns | Partial/full returns, conditions, unit transitions, history | Returned `GOOD` units become available; damaged/lost units do not |
| 4 — Operational UI | Dashboard, filtering, search, detail views, responsive polish | Operators can trace one unit through borrowing and return |
| 5 — Hardening | Authorization, validation, testing, audit safeguards, deployment | Duplicate borrowing/return and inconsistent stock are blocked |

Phases may be adjusted after schema review. Do not generate the whole application in one unreviewed step.

## 10. Critical acceptance scenarios

- Creating `Hair Dryer` and adding two units produces **one item type** with two physical units.
- Entering `hair dryer` as a new type triggers duplicate protection against `Hair Dryer` under the agreed uniqueness rule.
- Borrowing unit `HD-001` decreases Hair Dryer available count by exactly one.
- Borrowing `HD-001` again while still borrowed is rejected, even under concurrent requests.
- A borrowing containing two units allows one unit to be returned without automatically returning the other.
- Returning a `GOOD` unit makes it `AVAILABLE`; returning `DAMAGED` sends it to `MAINTENANCE`; returning `LOST` sets `LOST`.
- Returning the same borrowing line twice is rejected without changing stock.
- After the last outstanding line is returned, the borrowing is visibly and logically complete.
- A checked-out guest's existing borrowing remains visible for return and audit.
- No AppSheet connection, shared database, or sync is required for any feature.

## 11. Open decisions — do not assume

1. Exact web-specific role names and access matrix.
2. Complete fields and required/optional validation for `Guests`, `Returns`, `ReturnItems`, and master tables.
3. Whether a borrowing must include a room number and where to store it.
4. Item-name uniqueness scope and item/unit code generation rules.
5. Whether new stock defaults to `AVAILABLE` only when condition is `GOOD`.
6. Photo limits, formats, privacy, and retention policy.
7. Database, ORM, authentication provider, and hosting.
8. Whether maintenance-to-available and lost-recovery workflows belong in the first release.
9. Any reporting/export needs and whether a demo environment needs sample data.

When implementation encounters an unresolved decision, propose a small number of explicit options and document the chosen rule before building it.

## 12. Instructions for OpenCode contributors

- Read this document and `AGENTS.md` before modifying code.
- Treat the **confirmed business rules** as constraints; treat **proposed technical choices** as negotiable.
- Inspect existing repository structure and dependencies before proposing changes.
- Start each significant feature with a short implementation plan and expected files.
- Implement one vertical slice at a time; avoid unrelated refactors.
- Keep database changes in migrations and state-dependent mutations in transactions.
- Add automated tests for stock and return invariants.
- Run lint/typecheck/tests relevant to each change and report the results honestly.
- Update this document when a product decision changes; do not silently redefine requirements.
- Never attempt an AppSheet integration unless the project owner explicitly changes the scope.

---

**Specification status:** This is a practical starting contract for development, not a claim that every feature, schema field, or technology decision is already finalized.
