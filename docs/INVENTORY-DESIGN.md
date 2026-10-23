# Inventory workspace direction

## Kondisi aktif — 23 Oktober 2026

Ringkasan source pada commit a0eb555. Spesifikasi rinci: [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md). Status/verifikasi/batas langkah berikutnya: [CONTEXT.md](./CONTEXT.md); sejarah: [DEVLOG.md](./DEVLOG.md). Bagian arsip di bawah bukan aturan aktif.

- Workspace Figma light/navy/amber + Inter; kartu264px/grid terpusat/foto144px/name lane40px. Sidebar288/72px desktop dan modal kiri HP; glass hanya tiga surface sidebar yang disetujui. Panel jenis440px push/nonmodal mulai1440px, modal di bawah, full width di bawah640px; reduced-motion mengikuti preferensi perangkat.
- Tabel katalog: Detail barang dan + satu baris36px; +36x36px, padding0/ikon16px. Cell py12px, kolom aksi160px mobile/208px mulai640px. Kartu/drawer tetap44px. Search, pagination, unit cursor, permissions, pending/error dan logout dipertahankan.
- Drawer: konteks/X/divider, identitas dengan Edit kanan, foto/deskripsi, count + Tambah unit emas160px, lalu tabel No./Unit fisik/Detail & status. Header/footer tidak ikut body scroll. Tabel max40svh/header sticky/cursor existing50unit di luar scroll tabel. Footer memuat Riwayat pengajuan dan Ajukan penonaktifan merah rata kanan, selalu terjangkau.
- Baris unit: identitas utama nama → seri → HK, metadata sekunder dan44px target; nomor/nama/detail sejajar atas. Kondisi/kesiapan/lokasi/loss tampil ringkas; fakta lain dan audit ada di modal unit. Kesiapan: Siap/Belum siap/Perlu pemeriksaan/Menunggu verifikasi; jangan dianggap stok borrowable.
- Create jenis: nama wajib, foto katalog/deskripsi opsional; private disk existing. Sukses mencari nama baru/page1 agar kartu terlihat, tanpa membuat unit. Edit jenis hanya nama/deskripsi; sukses satu baris + X (max384px/padding16), fokus pada X, tanpa auto-dismiss. Batch sukses tetap menampilkan ringkasan unit terkonfirmasi.
- Tambah unit1–100 dengan satu lokasi aktif per batch dan accordion per unit. Kondisi wajib/Baik; serial/deskripsi opsional. Nama unit disabled; foto awal belum tersimpan. Pending/retry mempertahankan requestId/payload/lokasi; recovery belum lintas reload. Inline validation merah, noValidate/aria/fokus, tanpa browser bubble/spinner/textarea resize.
- Detail/edit unit dan audit history existing tersambung; edit hanya serial/notes, history10event/page. Nama/foto unit menunggu BE terpisah; jangan mengganti foto unit dengan katalog atau memalsukan histori tamu.
- Pengajuan: header global navy; drawer Riwayat pengajuan menuju daftar sama terfilteritemId/status ALL. Trigger pengajuan baru merah/prohibit. Review Supervisor dan batal oleh pengaju tersambung, dengan konfirmasi/guard/lock hasil belum pasti. Filters jenis/status memakai popup bersama; Terapkan emas; X menghapus applied query/default PENDING. Request list10/page, pagination chevron; item picker10hasil/page.
- Shared heading/back/breadcrumb mengikuti route: root sidebar tanpa back, child/reference memakai back icon + fallback. Secondary hover navy/putih memakai utility yang sama. X/chevron/disclosure/header konsisten dengan komponen existing.

Verifikasi historis terbaru:18file/155unit tests/typecheck passed; full lint0error/1warning artifact, targeted lint source passed. Fixture browser source aktual mencakup drawer52assertion, konfirmasi/reset23assertion dan tabel desktop/HP; bukan live auth/DB persistence. Final +ikon16px belum screenshot ulang. No new checks pada pembaruan MD ini.

---

## Arsip proposal awal

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

## Composition previews

Three synthetic desktop comps are saved under `.impeccable/mocks/`: `inventory-a.png` (sidebar and full-width table), `inventory-b.png` (sidebar and master-detail), and `inventory-c.png` (top navigation and table). Each has a prompt sidecar and embedded generation prompt; none is approved. Agent recommends A for readable item scanning with room for future authorized navigation.

Generated-image details requiring correction before implementation: use flat matte brass instead of painted button texture; disable pagination where only one page exists; omit C's unsupported sort indicator and A/B's unsupported account dropdown. B omits pagination, which remains required. These images do not verify mobile behavior, accessibility, or functional controls.
