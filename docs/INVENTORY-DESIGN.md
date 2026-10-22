# Inventory workspace direction

## Kondisi aktif — 22 Oktober 2026

Panduan implementasi aktif ada di [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md), terutama bagian 3–8. Semua bagian setelah pemisah di bawah adalah proposal historis; jangan memakai warna, ukuran, CTA atau status implementasinya untuk development berikutnya.

Workspace kini mengikuti Figma light/navy/amber dengan Inter. Katalog memakai kartu 264px, gap 16px dan grid terpusat yang menambah kolom saat sidebar diciutkan. Foto placeholder 144px; nama lane 40px, 15/20px 500, pendek rata tengah vertikal. Tombol Detail barang membuka panel unit kanan dari data existing. Search, tabel, pagination, unit cursor, permissions dan logout dipertahankan.

Sidebar desktop 288/72px; mobile modal dari kiri. Glass hanya untuk kotak operasional, menu aktif dan akun. Panel unit 440px nonmodal mulai 1440px, modal di bawah itu dan full width di bawah 640px. Slide masuk 420ms/keluar 280ms, indikator menu 380ms, dengan reduced-motion. Foto nyata dan UI mutasi selain create jenis belum dibuat. Bukti terbaru di DEVLOG; teks proposal lama bukan bukti verifikasi.

Update create/stock: Tambah jenis barang tersedia bagi Staff/Supervisor lewat native modal putih maksimum512px: nama wajib, deskripsi opsional maksimum2000, foto katalog opsional maksimum2MiB dengan preview dan penyimpanan lokal privat. Setelah201, pesan hanya Jenis barang berhasil ditambahkan.; pencarian berpindah ke nama baru/page1 supaya kartunya terlihat. Management tetap baca saja. Jenis baru tidak membuat unit.

Tombol + emas44px di kanan Detail barang pada kartu/tabel membuka Add Stock maksimum576px. Panel kanan berurutan nama → count unit → tombol full-width + Tambah stok → tabel yang tetap ada saat kosong; penjelasan count yang berulang dihapus. Nama panjang memakai Selengkapnya/Ringkas rata kanan.

Form menampilkan Jumlah unit * tanpa spinner, helper 1-100 unit per penambahan, dan Lokasi awal * sekali untuk seluruh batch dari lokasi aktif database. Accordion Unit N hanya membuka satu unit; perubahan jumlah menutup semuanya tanpa menghapus isian unit yang masih ada. Kondisi unit * default Baik, Nomor seri (opsional), Deskripsi (opsional), tanpa kondisi global/override berulang. Textarea deskripsi unit/jenis memakai resize-none. Deskripsi dikirim sebagai notes API. Lokasi dikirim sebagai initialLocationId; server menolak pilihan tidak aktif/hilang dan mencatatnya di setiap unit/audit. Caller lama tanpa pilihan mempertahankan fallback HK_MAIN_STORAGE. Tombol aktif memakai cursor pointer; disabled not-allowed, pending wait. Retry hasil tidak pasti memakai ID/payload sama selama halaman tetap terbuka, bukan recovery lintas reload. Koreksi, history dan penonaktifan frontend berikutnya belum dibuat. Spesifikasi DESIGN_SYSTEM bagian10; storage ITEM-CATALOG-STORAGE.md.

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
