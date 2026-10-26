# Housekeeping working context

Snapshot: 26 Oktober 2026, base HEAD d1997e7, branch feature/backend. Owner mengizinkan penerapan panduan BE foto wajib saat Tambah unit. Source/tests/dokumentasi berubah pada working tree; agent hanya meninjau source/diff. Lint/typecheck/test tetap dijalankan owner. Tidak ada perubahan FE, schema, migrasi, dependency, atau data DB pada langkah ini.

## Sumber dan cara kerja

- Aturan bisnis: PROJECT.md. Desain aktif: docs/DESIGN_SYSTEM.md, dengan ringkasan INVENTORY-DESIGN.md dan LOGIN-DESIGN.md. Bukti historis: DEVLOG.md; proposal dalam docs/design-history tidak aktif.
- Bahasa UI/komunikasi Indonesia. Sebut FE atau BE sebelum berpindah scope. Owner biasanya mengetik dari panduan; delegasi edit berlaku pada tugas yang disetujui, bukan izin permanen mengubah BE. Instruksi terbaru26Oktober: owner menjalankan lint/typecheck/test; agent cukup memberi perintah dan tidak menjalankannya. Catat hasil owner terpisah dari bukti historis agent.
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
- Tambah unit: jumlah1–100, satu lokasi awal aktif per batch, accordion per unit (maksimal satu terbuka; ubah jumlah menutup semua). Kondisi wajib/default Baik; serial/deskripsi opsional. Deskripsi dikirim sebagai notes. Nama unit FE aktif/opsional/max100, dinormalisasi trim/collapse dan dikirim sebagai name; BE menerima kontrak yang sama. BE kini mewajibkan minimal satu foto awal per unit baru melalui multipart; binding foto FE masih pending.
- Batch mempertahankan requestId/lokasi/payload saat hasil belum pasti; pending mengunci submit/close. Recovery page-local, bukan persisten lintas reload. Pemeriksaan lokasi, izin, replay/conflict tetap server-side.
- Detail unit: identitas nama → seri → HK; FE memakai unit.name dari read; edit mengirim name/serialNumber/notes dan mencocokkan response, termasuk null untuk clear; keadaan hasil belum pasti perlu reload. UnitHistory membaca audit nyata10event/page. BE history sudah menyertakan URL foto privat terkait unit/event; rendering foto FE dan riwayat peminjaman belum tersedia.
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

- Owner melaporkan semua checks fondasi foto/storage/schema/read/history passed sebelum commit d1997e7; output/totals tidak disuplai. Ini bukti owner untuk checkpoint sebelumnya, bukan hasil patch multipart baru.
- Patch BE saat ini ditinjau melalui source/diff saja. Agent tidak menjalankan lint/typecheck/tests/browser/build/DB, mengikuti pilihan owner. Tes parser, required photos, per-unit association, multi-photo, replay/conflict, concurrency, rollback, staging failure, dan unknown-outcome retention ditambahkan/disesuaikan untuk dijalankan owner.
- Batas transport: JSON/metadata256KiB, total multipart16MiB termasuk framing, JPEG/PNG/WebP statis2MiB per foto. Jumlah1–100 tetap; ukuran foto harus muat total request. File disiapkan sebelum transaksi; batch/unit/audit/photo metadata satu transaksi SQL. Foto dipasangkan lewat UUID unit, bukan urutan bulk-return.
- Replay requestId memerlukan metadata/bytes/urutan foto per unit yang sama; hash memakai bytes asli. JSON tanpa foto hanya dapat replay batch legacy yang sudah committed; batch baru ditolak PHOTOS_REQUIRED. Foto finalized tidak dihapus/diganti oleh endpoint ini.
- Cleanup file dilakukan saat staging gagal atau rollback diketahui. Saat hasil COMMIT belum pasti file dipertahankan agar evidence yang mungkin committed tidak hilang; file privat orphan dapat tertinggal. Rekonsiliasi orphan belum dibuat; filesystem bukan bagian transaksi SQL.
- Bukti agent/test/browser terdahulu, detail adapter pg, dan hasil FE historis ada di DEVLOG.md. Jangan menganggap hasil historis sebagai verifikasi working tree terbaru.

## Belum selesai dan batas langkah berikutnya

- Jalankan checks pada guides/UNIT-PHOTO-STOCK-IMPLEMENTATION.md bagian8. Patch panduan sudah diterapkan; hasil runtime/test baru belum diketahui. Tidak perlu schema/migrasi baru pada slice ini.
- Setelah checks BE passed, owner commit checkpoint SEBELUM pindah FE. Integrasi FE berikutnya: simpan File per unit, kirim FormData data + photo-0/photo-1/dst, pertahankan File/payload untuk retry, tampilkan lampiran history. Form FE lama masih JSON dan akan ditolak saat membuat batch baru.
- Nama unit BE/FE sudah terintegrasi pada checkpoint sebelumnya; kontrak di UNIT-NAMES.md. Fondasi evidence memakai ItemUnitPhoto + AuditEvent, private local disk di luar public/, scoped authorized GET dan URL history. Foto katalog tetap terpisah dari evidence unit. Jangan menampilkan status foto tersimpan sebelum response server memastikan.
- GuestVisit baru schema/constraint; service/API/form termasuk nomor booking manual belum tersedia. Borrowing/partial-combined return/inspection-maintenance/lost-settlement/retirement-report belum selesai. Dashboard demonstrasi bukan metrik hotel live.
- Independen dari PMS/AppSheet; tanpa barcode/kategori/pantry-distribution pada scope ini. Report export nanti. Jangan menambah workflow/permissions atau memakai data foto/tamu palsu untuk menutup fitur yang belum ada.
