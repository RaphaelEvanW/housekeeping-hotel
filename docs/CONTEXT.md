# Housekeeping working context

Snapshot: 23 Oktober 2026, HEAD a0eb555, branch feature/frontend. Working tree bersih sebelum pembaruan dokumentasi ini. Commit tersebut berisi revisi workspace, inventaris, pengajuan penonaktifan dan adapter antrean query. Status push remote belum diperiksa. Tugas saat ini hanya sinkronisasi MD; tidak mengubah source aplikasi atau memberi izin milestone baru.

## Sumber dan cara kerja

- Aturan bisnis: PROJECT.md. Desain aktif: docs/DESIGN_SYSTEM.md, dengan ringkasan INVENTORY-DESIGN.md dan LOGIN-DESIGN.md. Bukti historis: DEVLOG.md; proposal dalam docs/design-history tidak aktif.
- Bahasa UI/komunikasi Indonesia. Sebut FE atau BE sebelum berpindah scope. Owner biasanya mengetik dari panduan; delegasi edit berlaku pada tugas yang disetujui, bukan izin permanen mengubah BE. Pemeriksaan agent terakhir diizinkan khusus oleh owner; catat pelaksana dan hasil nyata.
- Gunakan skill relevan otomatis; Housekeeping Context untuk handoff, Ponytail untuk kode, Humanizer untuk prose, Design Taste/Impeccable untuk UI, Better Icons dengan ikon existing, Playwright untuk browser. Ikuti AGENTS.md dan docs Next terpasang.
- Jangan commit/push/switch/stash, menambah dependency, migrasi atau data DB tanpa scope yang sesuai. Dokumentasi progres boleh diperbarui setelah langkah terverifikasi.

## Stack dan file utama

- Next16.4/React19.3/App Router/TypeScript/Tailwind4; Prisma7.10/PostgreSQL/pg8.23.1; Better Auth1.7.7; Vitest4.1.11. package.json adalah rujukan versi/scripts.
- Auth: src/server/{auth,get-active-user,require-active-user,require-permission,authorize-api}.ts; permissions di src/lib/permissions.ts. Root ke /login; login ke /start, lalu route pertama yang diizinkan. Signup dinonaktifkan; akun nonaktif ditolak saat akses diperiksa.
- Workspace shell: src/app/(workspace)/workspace-shell.tsx; src/lib/{navigation,workspace-breadcrumbs}.ts; shared heading/back/breadcrumb di src/components/workspace-*.tsx. Administration masih placeholder; dashboard memakai label Data demonstrasi.
- Inventaris: src/app/(workspace)/inventory/page.tsx; inventory-view.tsx; inventory-drawer.tsx; create-item-dialog.tsx; edit-item-dialog.tsx; add-stock-dialog.tsx; unit-details-dialog.tsx; unit-history.tsx.
- Master/query: src/server/{items,list-items,item-units,stock-locations}.ts. API /api/items, /api/items/[itemId], /api/items/[itemId]/units, /api/stock-batches. Unit edit/history: /api/item-units/[unitId] dan /history; server/item-unit-history.ts.
- Penonaktifan FE: inventory/request-item-deactivation-dialog.tsx dan inventory/deactivation-requests/. BE existing: server/item-deactivation.ts, list-item-deactivation.ts dan API deactivation-requests. Pengajuan, keputusan Supervisor dan pembatalan pengaju tersambung; role/validasi tetap server-side.
- DB memakai src/server/serialized-prisma-pg.ts: queryRaw/executeRaw diantrekan per transaksi; transaksi berbeda tetap paralel. Lihat DATABASE-QUERY-SERIALIZATION.md; restart dev bila global client lama masih tercache. Tidak memerlukan generate/migrasi.
- Foto katalog: server/item-photo.ts, migration20261022090000, private disk .data/item-photos atau ITEM_PHOTO_DIR. Lihat ITEM-CATALOG-STORAGE.md; upload name/description/photo hanya pada create. PATCH jenis memperbarui nama/deskripsi, bukan foto.

## Flow yang sudah terpasang

- Items adalah jenis; ItemUnits adalah unit fisik. Total terdaftar dihitung dari records, bukan stok siap dipinjam. Search/pagination/selected item dan cursor50 unit tetap memakai layanan nyata.
- Tambah jenis: nama wajib, deskripsi/foto katalog opsional. Sukses menutup form dan mencari nama baru di page1 agar hasil terlihat; tidak menambah unit otomatis. Edit jenis hanya nama/deskripsi; konfirmasi berhasil satu baris + X, tanpa auto-dismiss.
- Tambah unit: jumlah1–100, satu lokasi awal aktif per batch, accordion per unit (maksimal satu terbuka; ubah jumlah menutup semua). Kondisi wajib/default Baik; serial/deskripsi opsional. Deskripsi dikirim sebagai notes. Nama unit disabled karena BE belum tersedia; tidak dikirim. Foto awal belum didukung alur simpan.
- Batch mempertahankan requestId/lokasi/payload saat hasil belum pasti; pending mengunci submit/close. Recovery page-local, bukan persisten lintas reload. Pemeriksaan lokasi, izin, replay/conflict tetap server-side.
- Detail unit: identitas nama → seri → HK; saat ini name:null, jadi seri/HK dipakai. Edit hanya serialNumber/notes; keadaan hasil belum pasti perlu reload. UnitHistory membaca audit nyata10event/page; belum ada riwayat peminjaman/foto yang belum didukung backend.
- Penonaktifan: header katalog membuka daftar global; Riwayat pengajuan di drawer membuka daftar sama dengan itemId/status ALL. Ajukan penonaktifan merah hanya membuat request; Supervisor menyetujui/menolak terpisah, pengaju membatalkan pending miliknya. Management read-only untuk alur ini.
- Daftar: default PENDING,10/page, filter jenis searchable/paginated dan status dengan WorkspaceFilterDropdown yang sama. Terapkan mengirim keduanya dan reset page; X setelah filter diterapkan menghapus query dan kembali default PENDING. Keputusan/batal memakai konfirmasi, pending guard dan lock hasil tidak pasti.

## Standar visual terbaru

- Figma1zcG8yCxhIVZlx50938se0 + revisi owner: Mövenpick Hotel, workspace light #F8F9FF/navy #131B2E/amber #904D00, Inter body/heading. Login tetap foto/layout/Geist dengan navy glass dan password tanpa reveal.
- Sidebar288/72px desktop, modal kiri pada HP; tiga surface glass hanya operasional/menu aktif/akun. Animasi sidebar420ms, indikator380ms; panel masuk420/keluar280ms dengan reduced-motion.
- Kartu264px, grid terpusat/foto144px/name lane40px. Tambah ruang menghasilkan kolom baru, bukan kartu meregang. Tombol kartu44px; tabel Detail barang/+ satu baris36px, +ikon16px dan padding0; cell py12px, kolom aksi160px mobile/208px mulai640px.
- Drawer440px nonmodal/push mulai1440px; modal di bawahnya, full width di bawah640px. Header/footer terpisah dari body scroll; tabel max40svh dengan sticky header, cursor di luar scroll tabel. Riwayat/pengajuan tetap terlihat di footer tanpa menimpa baris.
- Edit di kanan identitas; count + Tambah unit satu toolbar. Nomor/nama/status align-top/padding12px/line-height20px; identitas unit tetap44px. Readiness: Siap/Belum siap/Perlu pemeriksaan/Menunggu verifikasi; bukan jaminan borrowability.
- Secondary ws-button-secondary: hover navy/putih, border/radius seragam. Primary emas; link daftar global navy; submit-request trigger merah/prohibit. X/chevron memakai registry Phosphor existing dengan aria-label/title.
- Header dialog: konteks + X + divider + identitas/disclosure chevron kanan, tanpa label Selengkapnya berbeda-beda. Validasi inline merah, noValidate/required/aria/fokus invalid; textarea tanpa resize/spinner angka dihilangkan.
- Back hanya child/reference routes, bukan menu root sidebar. WorkspacePageHeading/fallbackHref dan registry breadcrumb wajib ikut route baru/loading/error. Browser history dipakai jika ada, fallback parent untuk entry tanpa history.

## Bukti terakhir dan batas

- Historis23Oktober: typecheck passed; unit18file/155test passed. Full lint exit0 dengan1warning pada output/verify-drawer-layout-browser.js (callback expression); targeted lint source yang disentuh lolos. Jangan menyebut seluruh tree bebas warning.
- Browser fixture source aktual:52assertion drawer (320–1440px/50unit/nama panjang/kosong/Management),23assertion konfirmasi/reset, serta uji tabel1366/390/320px. Read services/router terisolasi; PATCH sukses diintersep; tidak membuktikan live login/persistence DB. Screenshot di output/. Penetapan akhir +36x36/ikon16 hanya targeted lint, belum screenshot ulang.
- Adapter pg: probe read-only fresh-process list/history0warning; unit antrean termasuk dalam suite155. Integrasi transaksi/rollback/concurrency aktual belum diulang untuk adapter.
- Full suite21file/367test dari langkah lokasi batch22Oktober adalah bukti historis, bukan full-suite HEAD a0eb555. Build/integration/live-auth browser belum diulang setelah revisi terbaru. Tugas MD ini tidak menjalankan ulang npm/browser/DB.

## Belum selesai dan batas langkah berikutnya

- BE nama unit (schema/input/audit/read/PATCH/Add Stock) belum ada. Foto awal minimal1per unit dan evidence append-only disetujui sebagai kebutuhan; persistence/upload/private read/batch/history belum dibuat. Foto katalog bukan bukti unit. Jangan aktifkan form seolah data tersimpan.
- Setelah BE diotorisasi dan kontraknya siap: sambungkan nama/foto unit ke FE dan validasi history nyata. Ini rekomendasi lanjutan, bukan izin BE otomatis.
- GuestVisit baru schema/constraint; service/API/form termasuk nomor booking manual belum tersedia. Borrowing/partial-combined return/inspection-maintenance/lost-settlement/retirement-report belum selesai. Dashboard demonstrasi bukan metrik hotel live.
- Independen dari PMS/AppSheet; tanpa barcode/kategori/pantry-distribution pada scope ini. Report export nanti. Jangan menambah workflow/permissions atau memakai data foto/tamu palsu untuk menutup fitur yang belum ada.
