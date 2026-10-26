# Hotel Housekeeping — Web Application Project Specification

> Status: Consolidated business specification (v0.2, 14 October 2026)
> Purpose: Product scope and agreed business rules for development with OpenCode.
> Related agent instructions: [`AGENTS.md`](./AGENTS.md).
> Source of truth: Explicit project-owner decisions; the old AppSheet app is a workflow reference, **not** a technical dependency.

## 1. Product and working principles

Build a **standalone Next.js full-stack web app** for hotel Housekeeping inventory, guest borrowing, return, inspection, maintenance, lost-asset handling, and operational history.

- The Next.js web app and AppSheet are **separate systems**. No shared database, synchronization, API integration, or dependence on AppSheet. Manual entry is the MVP; keep data-entry logic service-oriented so importing from a future source is possible, but **do not build an importer now**.
- Optimize for real Housekeeping work: a few clear forms, conditional fields, batch actions where useful, and minimal approvals.
- **Do not turn real-world hotel SOP into web workflows.** Cashier/payment operations, whether a replacement item is commercially acceptable, who physically carries it to a storage room, guest damage-liability disputes, and internal coordination outside the agreed app flows are out of scope.
- **Do not keep reopening settled decisions** or ask a separate question for every optional field, location, status, or button. Infer sensible defaults from the established patterns. Ask only when an essential unresolved rule would block correct implementation, threaten data integrity, or meaningfully alter permissions/guest obligations.
- Distinguish *business decisions* (confirmed below) from *technical proposals* (not all finalized). Avoid speculative approval chains, forms, departments, and subsystems.

## 2. Primary domain concepts

| Concept | Meaning |
|---|---|
| `Items` | Master **types** of loanable items, such as Hair Dryer, Iron, Baby Cot. |
| `ItemUnits` | **Physical units** tracked independently, e.g. HD-001 and HD-002, each belonging to one `Item`. |
| `GuestVisit` | A guest's **individual stay/visit** and its current room; not a persistent cross-stay guest identity. |
| `Borrowings` | One transaction for **one occasion of issuing** item units to a guest visit. |
| `BorrowingItems` | Original issued **physical units**, linked to a borrowing and responsible-guest/room snapshot. |
| `Returns` / `ReturnLines` | Actual physical return events; one Combined Return can refer to units from **multiple Borrowings of the same GuestVisit**. |
| `ItemPhotos` / evidence | Photos attached to the specific transaction/unit/event, with uploader/time and immutable history after finalization. |
| `Locations` | Active Housekeeping storage/custody locations selectable once per Add Stock batch; replacement units retain the `HK Main Storage` default. |
| `MaintenanceRecords` / `VerificationRecords` | Actual work performed and Supervisor inspection outcomes; preserve repeated rounds. |
| `LostReports` / `Settlements` / `RecoveryEvents` | Lost/missing events, authorized resolution, and subsequent recoveries. |
| `AuditEvents` | Who changed what, when, and (where relevant) old/new values and required reasons. |

These are conceptual names; refine table normalization in a reviewed schema. Do **not** copy the AppSheet schema blindly.

Keep distinct dimensions rather than one overloaded status field:

1. **Lifecycle:** e.g. `ACTIVE` or `RETIRED` (historical units remain recorded).
2. **Custody:** e.g. `HOUSEKEEPING`, `GUEST`, `ENGINEERING`, `EXTERNAL_VENDOR`.
3. **Current location:** a real Housekeeping location or an appropriate logical location such as `WITH_GUEST`; for missing/lost stock retain last known location.
4. **Condition:** `GOOD`, `MINOR_DAMAGE`, `DAMAGED`, `MISSING_PART` (and any explicitly modeled unassessable condition).
5. **Operational readiness/hold:** derived availability, `ON_HOLD`, `PENDING_INSPECTION`, `PENDING_VERIFICATION`, etc.
6. **Borrowing obligation:** open/returned/lost-pending/settled; separate from the physical item's repair status.

`LOST` and `MISSING` are **events/operational states**, not valid substitutes for a physical condition like `DAMAGED`.

## 3. Roles and authorization

Four business/access roles:

- **Housekeeping Staff:** routine guest visit registration, room transfers, primary guest changes, borrowing/return processing, creating master items and stock, direct correction of clerical inventory errors, reporting damage/missing/lost, recording actually completed repairs, recording recoveries, proposing guest-LOST replacement or money compensation.
- **HK Supervisor:** all relevant Housekeeping capabilities plus required operational verification/inspection and approval/rejection of LOST reports and replacement/compensation settlements, retiring/reactivating units. Can correct master data without an approval chain. **Only Supervisor proposes WRITE_OFF.**
- **Management:** read-only access to operational summaries and records for oversight; business approval for WRITE_OFF and approvals required to grant/revoke Management role. Read access does not grant routine operational mutation permissions.
- **System Admin / IT:** technical account/access administration; **does not automatically have authority to approve business decisions** such as WRITE_OFF or Supervisor inspections.

Management role grants/revocations require in-app Management authorization and IT execution; exceptional emergency Management access is temporary and fully audited, with authorization by the Head/Manager IT (including self-authorization if appropriate). This exceptional-access procedure is **not a blocker for the operational MVP**: defer detailed recovery UX until account administration is being implemented.

Owner-confirmed access decisions (16 October 2026): users may hold multiple roles; permissions combine across their assigned roles. A single shared IT/admin account is acceptable under the owner's internal accountability process; application audit identifies that account, while individual operator attribution relies on the internal process. The admin role grants account/access administration, not implicit operational access or business approval. Additional roles remain subject to the authorization requirements above.

Enforce permissions **on the server**. Do not add approvals to routine staff data entry, corrections, Master Item creation, stock addition, location updates, or routine returns. Master Item deactivation follows the specific request/approval exception in section 5.1.1.

## 4. Guest visits and registration

- Only **registered hotel guests** borrow items. Employees/staff never borrow through guest borrowing.
- Create a new `GuestVisit` **per stay**, without cross-stay guest-identity merging. Manual guest check-in/check-out for MVP; no PMS sync.
- Minimum registration: **Primary Guest name, room number, booking number, check-in date, planned checkout date**, plus a generated immutable `GuestVisitID`. Owner confirmed on 22 October 2026 that the booking number is entered manually; it does not imply PMS integration. Booking-number schema/API/form implementation is pending a separate backend slice. Planned checkout date does not automatically checkout a guest.
- A guest must be `STAYING` to receive **new** borrowing. Checkout is allowed with outstanding units after warning, and does **not** automatically classify remaining units as LOST; returns and settlement remain possible after checkout.
- Where multiple guests share a room, one **Primary Guest** is responsible for borrowing under that stay. HK Staff may change the Primary Guest **with mandatory reason and audit**. Existing borrowings keep the **original responsible guest snapshot**, while subsequent borrowings use the new primary guest.
- HK Staff may directly transfer the visit's room **with reason and audit**, even with outstanding borrowing. Update the current visit room; each prior borrowing's original room snapshot remains unchanged. A room transfer does not create a new borrowing or falsely relocate guest-held units to Housekeeping.
- Warn about suspected duplicate active visits. Allow an override **with mandatory reason and audit**. For an exact duplicate (normalized primary name, same room, matching check-in and planned checkout dates, overlapping active stay), mark new visit `IsDuplicate`. A confirmed duplicate remains only **flagged**: no auto-merge, consolidation, liability transfer, new-borrowing restriction, or forced status change.

## 5. Master items, units and add stock

### 5.1 Item master

- **All HK Staff may create Master Items**, immediately usable without Supervisor approval. Supervisor may later revise names/details directly.
- `Add New Item Type` and `Add Stock` are **different operations**, even if reachable on the same Inventory screen.
- On new type creation, check normalized names (case insensitive, trim/collapse whitespace) so `Hair Dryer`, `hair dryer`, and `Hair  Dryer` are not registered as distinct types. Prefer selecting the existing type; preserve readable display names.
- Master Item creation/renaming **does not create stock or trigger physical inspection**.
- Owner-confirmed 22 October 2026: the item-type form includes name, optional catalog photo, and description. Existing/name-only clients and records remain valid; description may be blank. Catalog photos represent the type, not per-unit inspection or borrowing/return evidence. Categories remain out of scope.
- Owner selected persistent local disk outside public/ for catalog photos. Storage/access/limits and deployment backup requirements are documented in docs/ITEM-CATALOG-STORAGE.md. This is not a PMS or external storage integration.
- Owner-confirmed 23 October 2026: editing an existing item type includes its name and optional catalog description, under the existing item-update permission. Empty description clears it. Type editing and physical-unit name/serial/notes corrections remain separate actions; catalog photo editing is not included in this change.
- Record `CreatedBy`, `CreatedAt`, `UpdatedBy`, `UpdatedAt`; track old/new values for edits. Creation and name corrections have no approval queue.

### 5.1.1 Master Item deactivation (owner-confirmed 21 October 2026)

- HK Staff and HK Supervisor may submit a deactivation request with a mandatory reason. Submitting a request leaves the Item active.
- Only HK Supervisor may approve or reject a pending request. Supervisor may approve their own request; submitting and approving must be separate deliberate actions with an opportunity to inspect the Item, reason, and effect.
- The requester may cancel their own pending request. Cancellation and rejection leave the Item active.
- Approval sets the Item inactive atomically with the request decision and audit. Record requester/reason and decision actor/time. Preserve physical units and historical records; this action does not retire units or change their operational dimensions.
- Existing Add Stock behavior rejects inactive Items. Whether deactivation also blocks new borrowing of otherwise eligible units, and the Item reactivation workflow, remain open decisions; do not infer them from deactivation.

### 5.2 Bulk Add Stock

- HK Staff chooses **an existing master Item** and a `Quantity`. The app creates exactly that number of new **physical `ItemUnits`** in a **single atomic transaction**.
- Each unit receives a **unique, immutable internal ID** and automatically generated, readable **UnitCode** (e.g. `HK-000001`); code generation must be concurrency-safe and never reuse a previously assigned code for another physical unit.
- Optional **per-unit Name, SerialNumber and Notes**, editable in a simple batch form/expandable rows. Do not require staff to fill each row when all optional details are blank.
- Owner-confirmed23October2026: a unit name is an optional human label, distinct from the item-type name and manufacturer serial. Names may repeat; neither name nor serial becomes the primary key. Existing UUID IDs and generated HK asset codes remain stable. Display priority is unit name, then serial, then asset code. Existing unnamed units remain valid. Authorized unit correction includes name, serial and description, with an audit trail; omission preserves the name and blank/null clears it. Row numbers are presentation order, not persistent unit identifiers.
- Implementation boundary updated26October2026: owner explicitly authorized the name backend slice. Nullable ItemUnit.name, shared input validation (optional/max100, trim/collapse whitespace), Add Stock, PATCH, reads and old/new audit are implemented. Omitted values preserve existing names; blank/null clears them. Named stock retries include the normalized name; unnamed retries retain the legacy hash. FE activation was separately authorized and implemented26October2026: optional names are sent/read/displayed and audited name changes appear in unit history. FE lint/typecheck/tests/manual verification await the owner. Photo persistence is not part of this slice.
- Owner-confirmed 23 October 2026: every newly registered physical unit requires at least one actual initial-condition photo. This is separate from the optional item-type catalog photo; catalog imagery must not silently stand in for unit evidence. Enforce the requirement on the server before creating new stock, not only on the form. Existing units remain accessible without fabricated initial photos or retrospective timestamps; committed batch replays must not create duplicate units or evidence.
- **Initial location is selected once for the entire Add Stock batch** from existing active locations (owner confirmation, 22 October 2026). Every unit in that batch uses the selected location, with custody = `HOUSEKEEPING`. The frontend requires an explicit selection; the server rechecks location activity atomically. Legacy API requests without `initialLocationId` retain the `HK_MAIN_STORAGE` fallback. Stock registration does not create locations. After registration, internal Housekeeping moves use the existing simple audited location-update mechanism when necessary.
- Use the existing condition/readiness rules for the physical units, with a practical default of `GOOD` and override only when needed. Non-GOOD units are not automatically borrowable.
- **Stock is computed from registered physical units and their current state**, never from a writable total stock counter. A batch insert that fails partway must not create partial stock.
- HK Staff **corrects input errors directly** by editing the affected unit(s), without Supervisor approval. Mistakes like serial-number typos or notes do not need inspection. Never silently rewrite finalized borrowing/return evidence or use a clerical edit to bypass an actual ON_HOLD/inspection. A mistaken unused phantom registration may be corrected/removed with an audit trail; historical operational records must not be destroyed.

### 5.2.1 Per-unit history and photo evidence (owner-confirmed 23 October 2026)

- Every physical unit has its own history. Photo evidence appears within that unit history, alongside registration, corrections and later borrowing/return/condition events; it is not a separate photo-log module.
- Each saved photo is associated with the specific unit and event, with the actual recording time and responsible staff. Draft uploads may be removed/replaced before saving. Finalized evidence is retained; a later photo or correction adds history instead of overwriting/removing an earlier saved image or finalized transaction.
- When borrowing/return modules are implemented, unit history identifies the relevant real guest/visit and actual issue/return times while preserving transaction snapshots. Do not invent borrowing records for a unit or fabricate missing old photos. This decision does not imply those modules are already implemented.
- A newly discovered problem after a finalized return is a new report/event under section 8.1, not a rewrite of the original return. Uploading a photo alone does not clear holds or change operational condition/readiness.
- Item-type detail and individual-unit detail are distinct views. Use the approved Figma Detail & Manajemen Aset Inventaris as the composition reference for both, adapted to their respective scope. Type detail groups units; unit detail shows one unit's identity, photos, separate operational state fields, and its own history.

### 5.3 Derived stock and borrowing eligibility

Track at least: total registered units, ready/borrowable, currently borrowed, on hold/pending inspection/maintenance, lost/missing, retired. **Do not equate total registered with ready stock.**

A unit may be offered for new borrowing only when **all** are true:

- It is an active physical unit not retired, lost, or missing.
- It is fit for use and has **no active hold/inspection/maintenance blocker**.
- `CurrentCustodian = HOUSEKEEPING` and it is not held by Engineering/vendor/guest.
- It has **no unresolved active borrowing** for the same unit.

All **Housekeeping-custody storage locations** may supply borrowable units; do not create a per-location borrowing whitelist. A location labeled “HK Maintenance Area” does not in itself mean the unit is blocked. Apply real readiness/workflow and custody states.

## 6. Borrowing

- Borrower selection is restricted to `STAYING` guest visits. One **handover/issue occasion = one new Borrowings header**, even if the same guest borrows again later that day. Each header may contain multiple physical units.
- Every borrowing line must reference the **exact ItemUnit**, never just an Item type or quantity.
- Record logged-in `IssuedBy`, server timestamp, `GuestVisitID`, Primary Guest responsible **at issue time**, and **original room snapshot**. Display the current guest room separately where useful.
- **At least one photo of initial condition is mandatory for every ItemUnit on every issuance**. It is required anew for each issue, not reused from past borrowing. Link the evidence to that `BorrowingItemID` (not only the borrowing header). Multiple photos per unit may be supported.
- The selected unit must be eligible at save time. Atomically create borrowing/header/lines, associate uploaded evidence, change custody to `GUEST`, and set logical location `WITH_GUEST`.
- Reject double borrowing (including simultaneous requests), duplicate line selection, missing photos, and stale eligibility. Finalization is all-or-nothing. Use server-side validation, database constraints/locking, and safe retry behavior.
- Show every individual borrowing occasion in history; the guest visit detail may aggregate all outstanding units across occasions.

## 7. Combined and partial return

- Return operation is **per GuestVisit**, allowing selection of any outstanding **BorrowingItems** across different Borrowings for that **same guest visit**. Allow partial returns of any subset of lines; keep each line linked to its original borrowing.
- One combined return is **one atomic save**: if any selected line fails validation or upload, save **none** of them. Do not add complex partial-success/error-retry queues.
- The default receiving **location** belongs to the return header and can be overridden per unit/return line. Save the **effective actual receiving location per line**. Never auto-return everything to its original borrowing location.
- `ReturnedBy` / receiver comes from the authenticated staff session and return timestamp from server. Different staff can issue and receive.
- **Return condition defaults to `GOOD` for each unit**, overridable to `MINOR_DAMAGE`, `DAMAGED`, or `MISSING_PART`.
- **Return photo is optional for `GOOD`** and **mandatory (at least one per unit) for every non-GOOD return**. Validate server-side and preserve original borrowing photos.
- On physical return, close only the selected borrowing lines as `RETURNED`, switch custody to `HOUSEKEEPING`, update actual effective location, and record condition/history.
- `GOOD` may become ready immediately **if all other availability rules allow**. Any non-GOOD return becomes `PENDING_INSPECTION` and cannot be borrowed until cleared through the existing Supervisor workflow.
- A physically returned damaged item is **no longer an outstanding borrowing**; damage/maintenance does not keep guest borrowing open. Guest payment/damage liability disputes are handled **offline**, not inside this app.
- Partial borrowing remains outstanding only for the unreturned lines. When no lines remain outstanding, the borrowing's canonical/effective completion state is RETURNED. **Never repeat the AppSheet bug** where display says RETURNED while operational status remains BORROWED.
- Prevent duplicate returns and race conditions; preserve original issue snapshots and immutable final return history.

## 8. Inspection, holds, maintenance and custody

### 8.1 Reporting and holds

- When Staff discovers damage **after a previously finalized GOOD return**, they may report it immediately; place the unit **ON_HOLD** at once without waiting for Supervisor approval. The original GOOD return remains historical truth; create a separate damage report with notes, reporter/time and relevant evidence.
- When Staff discovers a **missing unit that was not on guest borrowing**, they report `MISSING`; the unit immediately becomes **ON_HOLD / not borrowable** without approval. Preserve last known location. Supervisor may later confirm `LOST` or restore appropriately if found. Do not fabricate a guest obligation.
- An active guest borrowing must not be turned into a fake Housekeeping receipt to report a problem.

### 8.2 Actual maintenance work, not a ticket-routing app

- **No repair assignment, work-order dispatch, approval-to-repair, or routing workflow.** When actual repair happens, Staff simply records who fixed it (person and HK/Engineering/vendor team), work performed, results, actual work/completion time, `RecordedBy`, timestamp, and optional photos/documents.
- Engineering/vendors do **not** need app login. Physical handovers to/from Engineering or vendors capture sender/recipient/time and location/custody; ordinary internal Housekeeping moves are a simple audited update.
- After staff records completed repair, the unit becomes `PENDING_VERIFICATION`. It is **not** automatically READY.
- Supervisor can also directly inspect/release an `ON_HOLD` unit **without fabricating a repair record** when no repair was needed.

### 8.3 Supervisor verification

- For **every Supervisor Verification**, require per-unit **Result, Notes, and Photo Evidence**. Identify verifier from the authenticated session, record time, and keep each verification round.
- Passing `FIT_FOR_USE` clears the relevant hold when all actual requirements are satisfied. Failing `UNFIT_FOR_USE` keeps/returns the unit to ON_HOLD, without auto-creating a maintenance job.
- For multiple units inspected together, provide a batch UI with individual results/notes/photos, and a **single all-or-nothing atomic Save**. No partial success workflow.
- A FIT_FOR_USE decision does **not** imply borrowable if the unit is still physically in Engineering/vendor custody or otherwise has a blocker; receiving it back in Housekeeping custody remains a separate recorded event.

## 9. Lifecycle: retirement and reactivation

- HK Supervisor may mark a physical unit `RETIRED` with reason and supporting evidence, **without an extra approval**. Retired units remain in history and are excluded from operational/ready stock; do not delete their records.
- HK Supervisor may **reactivate the same physical RETIRED unit** with the normal verification requirements: Result, Notes, Photo. A pass reactivates it subject to other custody/readiness rules; a fail leaves it retired.
- **No DISPOSED status or disposal-tracking subsystem**. The last recorded location of a retired unit is not necessarily proof of its current physical whereabouts.

## 10. LOST, MISSING, settlement, and recovery

### 10.1 Guest-borrowed LOST

- Staff can report an outstanding borrowed unit as LOST; **Supervisor approval confirms LOST**. The specific guest borrowing obligation stays unresolved until actual return, approved replacement, approved money compensation, approved WRITE_OFF, or physical recovery as defined below.
- Do not automatically classify outstanding units as LOST at guest checkout.

### 10.2 Simple settlement form

Present one straightforward **LOST Settlement form** that shows fields conditionally based on a method selector:

| Method | Basic fields / approval | Outcome |
|---|---|---|
| `REPLACEMENT` | Staff records what replacement item was received, **initial condition default GOOD (staff may override)**, notes and **required photo**, physical receipt confirmation; **HK Supervisor** APPROVE/REJECT. | After physical receipt + approval, resolve original obligation and create exactly one new physical `ItemUnit`. |
| `COMPENSATION` (money) | Amount, notes, optional supporting evidence as appropriate; **HK Supervisor** APPROVE/REJECT. | Resolve original guest obligation; **does not create inventory**. No payments, cashier workflow, or billing integration. |
| `WRITE_OFF` | Only **HK Supervisor** can propose; **Management** approves/rejects, with rationale/audit. | Resolve original guest obligation without creating inventory. System Admin alone cannot approve. |

- Whether an item is a suitable/equivalent replacement, whether payment was received, and the physical handoff process are **decided operationally outside the web app**. **Do not implement item equivalence checks, quality scoring, approval eligibility restrictions by condition, or cashier/location-transfer workflows.**
- A pending or rejected replacement **does not create an ItemUnit, change stock, or resolve the guest obligation**.
- Only **after** receipt is confirmed and Supervisor approves, atomically approve the settlement, create the new ItemUnit, link it to the original lost ItemUnit and borrowing line, resolve the obligation, and write audit. Prevent duplicate approvals/duplicate units.
- Replacement-created ItemUnit starts with location **`HK Main Storage`** and custody **`HOUSEKEEPING`** automatically; no location-selection form. Initial condition comes from the submitted record. GOOD can become ready if other rules permit; non-GOOD becomes `PENDING_INSPECTION`. Supervisor's acceptance of the replacement is **not** a FIT_FOR_USE inspection.
- An original lost unit stays LOST after its guest obligation is settled by replacement or compensation unless physically recovered; the replacement is a **different physical unit**.
- A guest-LOST borrowing unit has at most **one finalized resolution**. Rejected proposals remain in history, and new proposals may be recorded.

### 10.3 Missing/unborrowed stock and physical recovery

- Missing Housekeeping stock has **no fake guest liability**. Staff reports MISSING immediately as above; Supervisor confirms LOST or supports restoration when found.
- HK Staff can record `FOUND` recovery of previously LOST unborrowed stock **without new Supervisor approval**, with actual location, condition, who/time and notes. GOOD can become ready if otherwise eligible; non-GOOD requires inspection. `FOUND` is a recovery **event**, not a permanent lifecycle status.
- If a physical unit lost **during an active guest borrowing** is found and physically received by Housekeeping, record recovery and **resolve that unit's open guest obligation simultaneously** as `PHYSICAL_RECOVERY`, **not** as a fictitious guest RETURNED. Other units remain outstanding. Update actual custody/location/condition, readiness and audit.
- If compensation/replacement already **finalized** the obligation, later discovery of the original unit **does not reopen settlement, auto-refund, or reassign responsibility**. Record a new recovery event; if physically eligible it may join inventory again. The original and replacement may coexist as different ItemUnits.

## 11. Auditing and photos

- Capture actors through authenticated sessions, authoritative server timestamps, and domain-event histories for creation, edits, transfers, borrowing, returns, holds, repair, inspection, lost decisions, settlements, retirements, and recovery.
- Store **old/new values for administrative corrections**, required reasons for room/primary-guest changes and registration duplicate overrides, and required Supervisor verification notes/photos.
- Photos must be tied to the **specific ItemUnit/event/borrowing line/return line** they document, not just the header or Item type. Photo upload must succeed before finalizing any operation requiring it. Keep finalized evidence/history immutable or append a traceable correction event rather than silently overwrite it.
- Avoid leaking personal guest records or private evidence URLs. Actual storage provider, limits and retention are technical/operational configuration items; they are **not new business approval workflows**.
- Atomic DB transactions for business records, coupled stock/custody/readiness changes and audit; use idempotency/constraints where retries or concurrency can duplicate operations.

## 12. Core UI and screens

Prioritize a responsive, practical UI with these capabilities (exact layout is flexible):

- **Dashboard:** registered/ready/borrowed/held/lost summaries and links to filtered lists.
- **Inventory:** Master Items and ItemUnits searchable lists, Add New Item Type, **Bulk Add Stock** with quantity + optional details per unit, direct ItemUnit corrections, unit history.
- **Guests / GuestVisit detail:** check-in/out, current room, primary guest, duplicate flag, guest borrowing/return/settlement history and outstanding unit list.
- **Borrowing:** one or more exact ready units, **mandatory photo per unit** and visible issuer/guest information.
- **Combined Return:** choose outstanding units across borrowings for one visit, default GOOD per line, conditional mandatory photo for non-GOOD, receiving location default + per-line override, one atomic Save.
- **Inspection / Maintenance:** simple issue/hold entry, record actual repair work, Supervisor verification with Result/Notes/Photo, optional batch verification.
- **LOST / Settlement:** simple method selector (money/replacement/write-off), conditional fields, role-appropriate approval, separate physical recovery events.
- **History / Audit / Admin:** trace physical units and responsible staff, role-limited technical/admin actions.

Use labels and default values instead of unnecessary questions, wizard steps, or separate forms. User-facing language primarily Indonesian; readable codes/labels rather than opaque DB IDs.

## 13. Technical direction (review at implementation)

**Current project foundation (source23October2026):** Next.js16.4 App Router, React19.3, strict TypeScript and Tailwind4. Inspect package.json/lockfile and installed Next documentation before editing; these versions describe the current checkout, not a future upgrade decision.

**Implemented technical direction:** one Next.js full-stack application with server-side services, PostgreSQL/Prisma7.10, Better Auth1.7.7 sessions and server-side RBAC. Catalog photos use private persistent local disk for development, as approved by the owner. Physical-unit evidence has private local storage, event-linked metadata, scoped read/history URLs, and mandatory-photo multipart stock registration (owner reports BE checks passed). FE photo submission/history rendering is implemented in the current working tree and awaits owner verification. Production hosting, evidence retention and deployment configuration remain separate decisions; do not reopen the installed database/ORM/auth choices as if the app were a starter.

Implementation expectations:

- Inspect repository and `AGENTS.md` before modifying code; use the existing `src/` structure and Next.js version-specific conventions.
- Use schema constraints, validated server mutations, concurrency-safe unit-code generation, and transactions for multi-entity state changes.
- Avoid free-form stock counters and contradictory duplicated status fields; define derived availability and borrowing completion consistently.
- Prefer the smallest working implementation; do not create microservices, integrations, repair-ticket modules, cashier/payment systems or new approval stages.
- Keep technical/design choices traceable but **do not block progress on nonessential cosmetic decisions**. When a rule isn't specified and can be safely changed later, apply a sensible default consistent with this document.

## 14. Suggested incremental delivery

1. **Foundation:** inspect starter, confirm technical stack/schema/RBAC strategy, set up database/auth/roles and baseline testing.
2. **Inventory:** master Items, ItemUnits, locations, Bulk Add Stock, stock derivation, audited corrections.
3. **Guests + Borrowing:** visit-based guests, primary-guest/room snapshots, borrowable unit selection, required issue photos.
4. **Combined Return:** partial return across multiple borrowing headers, per-unit condition/photo, receiving location and atomic status updates.
5. **Inspection + Maintenance:** holds, physical custody handovers, simple actual-repair logs, Supervisor verification/batch verification.
6. **LOST + Lifecycle:** missing/lost reports, settlement approval, replacement creation, recovery, retirement/reactivation.
7. **Operational polish:** dashboard, search/history/audit, access-hardening, tests, responsive UI and deployment.

Implement one vertical slice at a time and verify it; **do not build the full app in one enormous unreviewed change**.

## 15. Minimum acceptance tests

- `Hair Dryer` vs `hair dryer` does not create duplicate types; all HK Staff can create one and Supervisor can edit it without approval.
- Bulk Add Stock quantity 10 creates **exactly 10 unique physical units**, linked to one Item type and one selected active initial location, with no partial results on error. Missing/inactive selected locations are rejected. Legacy requests without a selection retain `HK Main Storage`. Staff can correct a typo on 2 of those units directly; audit shows who/when/what changed.
- Two concurrent requests cannot borrow the same unit; issuance without photo **for each** selected unit is rejected.
- A guest can receive multiple separately recorded borrowing occasions; check-out and room changes preserve old borrowing/room/primary-guest snapshots and outstanding units.
- Combined Return can return units from different borrowings for the same visit in one atomic operation; default GOOD photo is optional; any non-GOOD line **requires** a photo and enters PENDING_INSPECTION.
- A DAMAGED physical return closes the specific borrowing line but does **not** create guest damage liability; other lines remain open, ready stock remains correct.
- Staff can immediately ON_HOLD a newly discovered problem; recording maintenance completion does not bypass Supervisor verification, which requires Result + Notes + Photo for **every** unit, saved atomically in a batch.
- An approved physically received LOST replacement creates **one** new ItemUnit (default location HK Main Storage), settles that borrowing obligation and is tracked separately from the original LOST unit. Rejection creates no unit. Non-GOOD replacement is pending inspection, not ready stock.
- Money compensation settles obligation without adding inventory; WRITE_OFF requires Management approval; late physical recovery does not undo finalized settlement.
- No business flow depends on AppSheet, a PMS, an external cashier, or a payment provider.

## 16. Decision policy for OpenCode

- Treat Sections 1–12 and their **explicit confirmations** as the agreed scope. The precise DB schema/table names and Section 13 technologies remain design details until reviewed.
- **Do not repeat already settled questions**, notably one selected initial location per Add Stock batch, default `HK Main Storage` for replacement units, routine staff edits without approval, and Supervisor involvement only in explicitly required workflows.
- Ask only **essential blocking questions** where two plausible paths would have a major effect on integrity, permissions or the business outcome. Otherwise document and apply the simplest reasonable default; surface it briefly in a plan or review.
- Do not add a business workflow because an edge case is theoretically possible. Preserve simple UI and real operational boundaries.
- Update `PROJECT.md` only when the project owner requests documentation changes or explicitly confirms a meaningful change. Avoid unrelated edits to `AGENTS.md`.

---

**Implementation status (23 October 2026; source commit a0eb555):** Authentication/access foundations, login and responsive workspace are implemented. Inventory FE uses existing authorized services for real catalog search/pagination, cards/table, selected-type drawer, physical-unit cursors, type creation with optional description/private catalog photo, type name/description editing, Add Stock with one selected initial location per batch, unit serial/notes correction and paginated audit history. Deactivation submission/list/filter, Supervisor approval/rejection and requester cancellation frontend controls are connected. The limited pg query-overlap compatibility fix is documented in docs/DATABASE-QUERY-SERIALIZATION.md; no business rule changed.

Unit-name BE persistence is implemented26October2026 under separate owner authorization; FE name form/read/history binding was separately implemented26October2026; verification awaits owner-run checks. Mandatory initial-unit-photo storage remains unimplemented BE work. Catalog photos are separate from physical evidence. GuestVisit has schema/constraints, but registration service/API/form and manual booking-number implementation remain pending. Borrowing, partial/combined returns, inspection/maintenance, lost settlement, unit lifecycle workflows, report export and real dashboard metrics are later slices. Dashboard examples are labelled Data demonstrasi. This status does not authorize the next BE slice.

Latest name-BE verification26October2026: Prisma generate/validate, typecheck and targeted lint passed; full31files/458tests passed, including focused3files/102inventory integration tests. Name migration applied to separate test/development databases; no production rollout. Earlier frontend unit suite18files/155tests is historical. Full lint had0errors/1warning in a browser callback artifact; targeted application-file lint passed. Browser checks used isolated actual-source fixtures and intercepted successful PATCH responses; latest revisions do not establish authenticated live flows, current integration/build results or production readiness. Detailed evidence and current file paths are in [docs/DEVLOG.md](./docs/DEVLOG.md) and [docs/CONTEXT.md](./docs/CONTEXT.md). Active UI rules are in [docs/DESIGN_SYSTEM.md](./docs/DESIGN_SYSTEM.md); 26October backend tests do not imply new authenticated-browser or production-build verification.

## 2026-10-22 — Approved Figma implementation scope

- Figma file `1zcG8yCxhIVZlx50938se0` supplies the workspace visual reference. Use **Mövenpick Hotel** as the requested display name; do not use the reference's hotel, guest, or staff identities as real records.
- Preserve existing server authorization, APIs, queries, pagination, selected-item state, unit cursors and logout. This approval covers presentation changes, not backend workflows or schema changes.
- Borrowing statistics and occupancy may use explicitly labelled **Data demonstrasi** while their actual services are pending. Inventory records and counts continue to come from existing services; do not substitute demonstration inventory.
- No barcode, PMS sync, pantry distribution or category feature in this slice. Relevant action feedback may use popups; no notification subsystem is requested. Report export is a future step, not a working feature implied by a Figma button.
- Forms should follow the Figma visual direction when their existing or separately authorized functional implementation is available. Do not expose decorative controls as working workflows.
