# Inventory workspace direction

Proposed composition, 21 October 2026. No approved comp or frontend implementation yet. PROJECT.md owns business rules.

## Confirmed brief

- Inventory frontend next, using existing backend capabilities and Tailwind CSS.
- Dark-brown frame with dark content surfaces, no white/cream panels.
- Useful for hotel Housekeeping on desktop and phones; avoid generic dashboard decoration.
- Comp-first workflow; owner types application code and runs checks. Backend checkpoint commit precedes frontend code.
- Preserve the accepted login until the owner explicitly includes it in redesign scope.

## Proposed treatment

Operate mode: staff find an item type, open physical units, or add inventory. Energy 1, rhythm 1, motion 1. Espresso framing and restrained brass accents provide warmth; data surfaces stay opaque and quiet.

| Role | Proposed color | Purpose |
| --- | --- | --- |
| Frame/navigation | `#211915` | Espresso connects to the hotel's brown identity. |
| Main surface | `#191C1B` | Warm charcoal with a subtle green undertone separates content from the frame. |
| Inputs/raised surfaces | `#242825` | Small luminance step identifies controls. |
| Dividers | `#3B403A` | Separate rows; control boundaries need their own contrast check. |
| Main text | `#E8E5DE` | Readable light text, never a panel background. |
| Secondary text | `#B6B9AE` | Dates and supporting information. |
| Action/focus | `#C4A36A` | Matte brass; dark text on filled primary buttons. |

Contrast and rendered desktop/mobile checks remain pending. No decorative glow, gradients, texture images, or glass data tables are proposed.

## First screen

- Compact desktop navigation, collapsible navigation on phones; only implemented destinations become links.
- Header identifies the signed-in user and provides logout.
- `Inventaris` heading and distinct `Tambah jenis barang` action for authorized roles.
- Name search, pagination, and rows with item name, active/inactive status, last update, and `Lihat unit`.
- `Tambah stok` belongs to a selected item so it cannot be confused with creating an item type.
- Desktop uses aligned rows; phone layout prioritizes name/status with accessible actions. No summary cards above routine work.
- Comps may contain clearly labeled synthetic examples. Production must use actual data and handle loading, empty, no-results, and error states.

Current list API returns names/status/timestamps and pagination, not borrowable stock. Do not invent availability totals or an active-status API filter.

This is a visual proposal, not DESIGN.md authority, owner comp approval, or an accessibility result. Next visual deliverable: compare compositions within the confirmed dark direction.
