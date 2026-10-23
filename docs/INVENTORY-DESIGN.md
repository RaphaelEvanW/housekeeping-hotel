# Inventory workspace direction

## Kondisi aktif — 23 Oktober 2026

Panduan implementasi aktif ada di [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md), terutama bagian 3–8. Semua bagian setelah pemisah di bawah adalah proposal historis; jangan memakai warna, ukuran, CTA atau status implementasinya untuk development berikutnya.

Workspace kini mengikuti Figma light/navy/amber dengan Inter. Katalog memakai kartu 264px, gap 16px dan grid terpusat yang menambah kolom saat sidebar diciutkan. Foto placeholder 144px; nama lane 40px, 15/20px 500, pendek rata tengah vertikal. Tombol Detail barang membuka panel unit kanan dari data existing. Search, tabel, pagination, unit cursor, permissions dan logout dipertahankan.

Sidebar desktop 288/72px; mobile modal dari kiri. Glass hanya untuk kotak operasional, menu aktif dan akun. Panel jenis 440px nonmodal mulai1440px, modal di bawah itu dan full width di bawah640px. Slide masuk420ms/keluar280ms, indikator menu380ms, dengan reduced-motion. Foto katalog, create/edit jenis, Tambah unit, detail unit serta koreksi serial/deskripsi unit sudah tersedia. Riwayat audit unit kini terhubung ke endpoint existing, 10 aktivitas per halaman; owner melaporkan pemeriksaan passed, tanpa rerun agent atau bukti browser baru. FE pengajuan, daftar/filter/pagination, keputusan Supervisor dan pembatalan pengaju tersedia di source. Runtime caller pagination dikoreksi agar service menerima string; perbaikan dan aksi baru menunggu pemeriksaan owner. Bukti terbaru di DEVLOG; teks proposal lama bukan bukti verifikasi.

Button Edit dengan pensil Phosphor berada di kanan nama jenis barang; memakai ws-button-secondary dengan target44px dan hover navy/white. Tersedia bagi Staff/Supervisor, termasuk jenis nonaktif. Native modal448px mengedit nama dan deskripsi jenis opsional melalui PATCH yang sudah diaudit. Error duplikat/session, pending guard, unknown-result reload dan isolasi portal/Escape tetap. Foto serta data/status unit tidak ikut diedit.

Klik identitas unit membuka detail fisik maksimum576px. Identitas saat ini seri→kodeHK; nama opsional masih persiapan FE disabled, dengan pesan menunggu backend. Hanya nomor seri/deskripsi dikirim ke PATCH existing. Management baca saja. Query ItemUnit.name dan seluruh ekstensi backend/migrasi yang belum disetujui sudah dicabut untuk mengatasi Unknown field name. Tidak perlu migrate/generate untuk fix ini. Pemeriksaan belum dijalankan ulang. Future name→seri→HK adalah arah produk, bukan fitur BE yang sudah tersedia.

Update Edit23Oktober: owner memakai edit-item-dialog.tsx / EditItemDialog, label Edit dengan pensil dan form nama+deskripsi katalog opsional. Agent memperbaiki urutan deklarasi/validasi dan prop deskripsi;93unit tests dan14browser checks passed. BE kini tersambung: updateItem/schema/API menerima description(max2000); kosong menghapus dan omission mempertahankan, transaksi/audit/no-op tetap benar. Final lint/typecheck dan full376tests passed;9browser checks API asli/no-op/reload passed. Pengubahan/clear/rollback/concurrency persistence diuji DB integration terpisah. Guide menjadi referensi, bukan pekerjaan pending.

Update create/stock: Tambah jenis barang tersedia bagi Staff/Supervisor lewat native modal putih maksimum512px: nama wajib, deskripsi opsional maksimum2000, foto katalog opsional maksimum2MiB dengan preview dan penyimpanan lokal privat. Setelah201, pesan hanya Jenis barang berhasil ditambahkan.; pencarian berpindah ke nama baru/page1 supaya kartunya terlihat. Management tetap baca saja. Jenis baru tidak membuat unit.

Tombol + emas44px di kanan Detail barang pada kartu/tabel membuka form Tambah unit maksimum672px. Panel kanan berurutan nama/Edit → deskripsi/foto → count dan Tambah unit satu toolbar → tabel No./Unit fisik/Detail & status (termasuk kosong). Riwayat pengajuan dan Ajukan penonaktifan berada di footer terpisah dari isi drawer yang scroll, sehingga selalu terlihat. Tabel scroll maksimum40svh, header sticky; cursor existing50 unit/halaman tetap di luar scroll tabel. Nomor, nama dan detail diratakan atas dengan padding/line-height sama. Readiness CLEAR: Siap, bukan jaminan unit bisa dipinjamkan. Count berupa metadata polos; Tambah unit emas lebar160px; red action mengikuti lebar isi dan rata kanan, tidak full width. Baris ringkas memakai urutan halaman, identitas utama/metadata, kondisi/kesiapan/lokasi/loss; deskripsi, penguasaan dan siklus ada di modal unit. Header form kini Tambah unit — [nama jenis] + X, satu divider; tidak mengulang nama jenis di bawahnya. Nama panjang memakai chevron bersama. Success menampilkan jumlah dan tabel urutan/nama/seri dari request terkonfirmasi, dengan Selesai pada footer. Spesifikasi aktif: DESIGN_SYSTEM7–10.

Form menampilkan Jumlah unit * tanpa spinner, helper 1-100 unit per penambahan dan Lokasi awal * sekali per batch. Accordion berlabel urutan — nama unit/jenis — seri; hanya satu terbuka. Field Nama unit disabled(pending BE), Kondisi unit *(Baik), Nomor seri/Deskripsi opsional. Perubahan jumlah menutup accordion dan mempertahankan isian unit yang masih ada. Deskripsi→notes; lokasi→initialLocationId, divalidasi server. Legacy caller tanpa lokasi memakai fallback existing. Create/edit jenis, Tambah unit dan Edit unit memakai validasi inline bersama: noValidate, p merah per field, aria-invalid/describedby, fokus invalid pertama; bukan popup browser. Retry mempertahankan ID/payload; recovery belum lintas reload. Riwayat unit dan penonaktifan FE sudah tersambung; revisi drawer terbaru diverifikasi agent: lint/typecheck,18file/152unit test dan52assertion browser fixture source aktual (bukan login/DB live). Foto unit perlu backend terpisah.

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
