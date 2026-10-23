# Housekeeping — arah desain aplikasi

Spesifikasi aktif, dikonsolidasikan 22 Oktober 2026 dari keputusan pemilik, Figma yang disetujui, dan revisi implementasi terakhir. Gunakan dokumen ini untuk UI berikutnya. `PROJECT.md` tetap sumber aturan bisnis; desain tidak mengubah permission, kontrak API, autentikasi, atau invariant unit fisik.

## 1. Otoritas dan batas

- Arah workspace: konten terang, sidebar navy, aksen amber/oranye, antarmuka operasional hotel. Ini menggantikan arahan espresso/crimson, dark-only, serta alternatif sage/olive terdahulu.
- Figma: https://www.figma.com/design/1zcG8yCxhIVZlx50938se0/Untitled?node-id=0-1 ; referensi Dashboard `1:2`, inventory `1:1161`, header `1:1734`, sidebar `1:1758`, card `1:1329`. Revisi eksplisit pemilik dalam dokumen ini mengungguli rincian Figma yang diganti.
- Nama tampilan Mövenpick Hotel; profil memakai akun yang benar-benar login. Jangan memakai profil atau foto katalog contoh sebagai data nyata.
- Bahasa UI: Bahasa Indonesia. Mode Operate; ENERGY 1, RHYTHM 1, MOTION 2 untuk panel/navigasi. Kepadatan mendukung staf di desktop dan telepon.
- Tailwind CSS dan komponen existing. Tidak memasang library, mengakses aset eksternal, atau menambah fitur demi kesamaan visual tanpa otorisasi.
- Versi spesifikasi sebelum konsolidasi disimpan di `design-history/DESIGN_SYSTEM-before-consolidation-2026-10-22.md` sebagai sejarah, bukan panduan aktif. DEVLOG menyimpan hasil pemeriksaan tiap langkah.

## 2. Warna

Gunakan token `ws-*` dari `src/app/globals.css`, bukan sampling screenshot.

| Token | HEX | Peran |
| --- | --- | --- |
| ws-background | #F8F9FF | Kanvas workspace |
| ws-sidebar | #131B2E | Sidebar dan dasar login |
| ws-surface | #FFFFFF | Kartu dan panel |
| ws-inset | #EFF4FF | Input, metadata, placeholder foto |
| ws-strong | #0B1C30 | Judul dan teks penting |
| ws-text | #45464D | Teks isi dan label |
| ws-muted | #BEC6E0 | Teks sekunder sidebar/login |
| ws-divider | #E3E7EF | Pemisah dekoratif |
| ws-control | #76777D | Batas input yang perlu terlihat |
| ws-primary | #904D00 | Aksi utama, fokus workspace |
| ws-primary-hover | #753E00 | Hover aksi utama |
| ws-accent | #FE932C | Menu aktif dan fokus pada permukaan gelap |
| ws-success | #216247 | Status positif pada bidang terang |
| ws-warning | #904D00 | Perlu perhatian pada bidang terang |
| ws-danger | #BA1A1A | Error/destruktif pada bidang terang |

Teks pada tombol primary putih. Status harus memiliki label selain warna. Aktif bukan berarti tersedia untuk dipinjam. Siklus, kondisi, kesiapan, custody, lokasi dan loss tetap terpisah. Token `hk-*` yang masih ada merupakan peninggalan implementasi sebelumnya; jangan mengambilnya sebagai palet workspace baru. Error login saat ini memakai `hk-danger` #F09B94 di atas navy.

## 3. Tipografi

Workspace memakai Inter yang sudah tersedia melalui konfigurasi Next Font, baik body maupun heading. `font-workspace` dan `font-heading` mengarah ke `--font-inter`, fallback Arial/sans-serif. Jangan menambah font baru tanpa persetujuan. Login tetap memakai Geist dari `font-sans` existing.

| Peran | Ukuran / line height | Bobot | Tracking |
| --- | --- | --- | --- |
| Judul halaman | 24/36px; dari 640px 28/36px | 600 | normal |
| Judul bagian | 16/24px | 600 | normal |
| Nama jenis pada kartu | 15/20px | 500 | normal |
| Isi/form workspace | 14/20px; penjelasan dapat 14/24px | 400 | normal |
| Aksi utama standar | 14/20px | 500 | 0.01em |
| Metadata/kontrol padat existing | 12/16–20px | 400–500 | normal |
| Label pendek existing | 11/16px | 500–600 | wide hanya untuk label uppercase |

Buka inventaris adalah acuan aksi utama standar: tinggi minimum 44px, padding horizontal 16px, Inter 14/20px 500 dan tracking 0.01em. Ini menggantikan 12px/600 pada tombol tersebut. Kontrol padat inventory existing belum dimigrasikan otomatis; gunakan peran yang sesuai saat menyentuhnya, bukan mengubah seluruh aplikasi tanpa scope.

Hindari negative tracking pada judul workspace atau bobot tebal untuk semua label. Gunakan tabular-nums untuk tanggal, jumlah dan kode numerik yang perlu dibandingkan. Nama panjang harus membungkus/clamp tanpa melebarkan halaman; nama lengkap tetap dapat diakses.

## 4. Layout dan permukaan

- Main maksimum 1440px, terpusat; padding 16px mobile, 24px mulai 768px, 32px mulai 1024px. Jarak kelompok utama 24px, gap kartu 16px, padding kartu 16px.
- Header sekitar 64px, putih opaque; shadow 0 1px 8px pada hitam 4%. Jangan menambahkan header blur.
- Kartu radius 8px, kontrol 4–6px. Resting shadow 0 1px 2px pada hitam 5%; jangan menumpuk shadow besar dengan outline dekoratif.
- Data surfaces putih/flat. Glass hanya pada area yang secara eksplisit ditetapkan di bawah dan login. Jangan menambah glow, gradient, garis merah di sisi menu, atau kartu dekoratif untuk mengisi ruang.

## 5. Sidebar dan akun

Desktop mulai 1024px: sticky setinggi viewport, lebar 288px, dapat diciutkan menjadi 72px. Saat ciut tampil ikon dengan accessible name/title; state lokal bertahan selama workspace layout terpasang, tidak disimpan sebagai preferensi pengguna.

Sidebar menampilkan brand teks, Operasional hotel, navigasi yang diizinkan role, dan akun. Jangan menambah destination dummy. Akun bertuliskan Selamat datang, nama pengguna di bawah, serta tombol logout ikon Phosphor existing di sebelah nama. Saat ciut hanya kontrol ikon. Logout mempertahankan pending/error handling; target 44px dan label Keluar.

Tepat tiga bidang memakai utility sidebar-glass:

1. Operasional hotel.
2. Satu background bergerak di belakang menu aktif.
3. Kotak akun.

Material: dasar navy #131B2E, surface putih 7%, border 1px putih 14%, inset highlight putih 10%, backdrop blur 10px. Ini pengecualian glass yang diminta pemilik, termasuk terhadap Antislop R-10. Blur di atas navy rata akan halus; jangan menambah gambar/gradient demi memperkuatnya. Menu aktif berteks #FE932C, tanpa stripe samping. Tinggi baris 44px dan gap 4px menjaga posisi background bersama.

Di bawah 1024px sidebar tersembunyi. Tombol kiri header membuka native modal dari kiri, lebar min(320px, viewport minus 48px), backdrop hitam 40%. Close, Escape, backdrop, pemilihan route, dan resize desktop menutupnya. Jaga focus containment dan pulihkan scroll/fokus sesuai native dialog.

## 6. Inventaris dan jenis barang

Kartu adalah jenis barang (`Items`); panel menampilkan unit fisik (`ItemUnits`). Pertahankan search GET, pagination 20 jenis per halaman, opsi Kartu/Tabel, selection URL dan cursor unit. Jumlah hasil berasal dari query nyata.

- Lebar kartu tetap 264px, menyusut hanya jika container lebih sempit. Kolom auto-fill berdasarkan ruang tersedia, gap 16px, justify-center untuk menyeimbangkan sisa ruang kiri-kanan. Jangan meregangkan kartu menjadi fraksi sama besar. Dengan viewport 1280px: sidebar terbuka muat tiga kolom, ciut muat empat.
- Area foto/placeholder 144px tinggi; ini menggantikan revisi 76px dan target proporsi lama 25–30%. Loading skeleton mengikuti ukuran dan alignment grid yang sama.
- Foto katalog opsional kini tersedia saat create jenis barang. Render foto nyata dari photoUrl berizin dengan object-contain; tampilkan Foto belum tersedia hanya saat photoUrl kosong. Jangan memakai stock photo palsu sebagai data produk. Penyimpanan: ITEM-CATALOG-STORAGE.md.
- Badge Aktif/Nonaktif di kanan atas. Nama berada dalam lane 40px, pendek rata tengah vertikal, panjang maksimum dua baris 20px. Nama lengkap tersedia dari title dan disclosure detail jika sangat panjang.
- Metadata Diperbarui berada di bawah nama. Tombol bernama Detail barang pada kartu maupun tabel, accessible name menyertakan nama barang; saat navigasi pending Memuat detail…. Tombol tetap membuka data unit existing, bukan fitur detail baru yang belum tersedia.
- Pada tabel gunakan header/kolom sejajar, status berlabel, tanggal tabular dan aksi yang tetap terjangkau. Metadata sekunder berpindah ke identitas pada layar sempit; jangan menghilangkan data/fungsi untuk meniru Figma.
- Pagination berlabel Sebelumnya/Berikutnya dan range nyata; tombol batas disabled. Pertahankan penanganan input invalid, tidak ada hasil, item hilang, dan error service.

## 7. Panel kanan detail barang/unit

- Mulai viewport 1440px: native dialog nonmodal 440px di kanan, di bawah header 64px, konten utama menyisakan 440px selama dialog terbuka. Close mengembalikan layout katalog.
- Di bawah 1440px: modal 440px dengan backdrop hitam 35%. Di bawah 640px: full width. Panel dapat scroll; nama panjang tidak boleh membuat overflow horizontal.
- Header Jenis barang terpilih, judul nama jenis tanpa prefiks Unit fisik, foto/deskripsi jika ada, count Unit fisik terdaftar, tombol + Tambah stok, lalu tabel unit. Hapus dua kalimat penjelasan lama di bawah count; label count tetap menyatakan unit terdaftar, bukan stok siap dipinjam.
- Nama jenis memakai komponen bersama ItemNameDisclosure, sama seperti form Tambah unit. Nama lebih dari80karakter diringkas dua baris; kontrol chevron di kanan membuka nama lengkap di tempat yang sama tanpa paragraf duplikat. Tidak memakai teks Selengkapnya/Ringkas yang terlihat; aksi tetap berlabel untuk pembaca layar. Nama pendek tampil tanpa disclosure.
- Daftar unit memakai tiga kolom: No.(32px), Unit fisik, Detail & status; empty-state colspan3. Nomor adalah urutan tampilan pada halaman cursor saat ini, bukan identitas permanen. Baris diringkas dengan padding vertikal8–12px: identitas utama nama → seri → kode aset, satu baris metadata sekunder, kondisi/kesiapan/lokasi serta peringatan loss. Deskripsi panjang, penguasaan dan siklus dipindahkan ke detail unit, bukan dihapus dari data. Tombol identitas tetap target44px dan nama maksimum dua baris. Jangan menggabungkan dimensi status atau menganggap aktif berarti siap dipinjam.
- Close, Escape dan backdrop bekerja sesuai mode; pertahankan normalized search/page saat melepas selection. Kembalikan fokus ke trigger yang masih terpasang. Native modal menangani fokus dan body lock.
- Panel dapat menampilkan foto katalog dan deskripsi jenis yang disimpan. Identitas unit adalah tombol yang membuka modal detail; accessible name menyertakan nama yang terlihat dan kode aset. Search, selection jenis dan cursor tidak berubah. Riwayat interaktif masih pekerjaan berikutnya.

Detail/edit unit23Oktober: inventory/unit-details-dialog.tsx menampilkan modal maksimum576px, gutter12px, padding20px/24px, header konteks + X44px + divider + identitas utama (nama unit → nomor seri → kode HK). Prioritas ini memakai helper unitDisplayName di src/lib/unit-display-name.ts, juga dipakai daftar unit. Nama jenis tetap konteks sekunder. Kode aset HK ditampilkan sebagai fakta sekunder; UUID tetap PK database. Fakta ditata dua kolom dengan label12px dan nilai14px; teks membungkus aman, modal dapat scroll. Nomor seri, kondisi, kesiapan, penguasaan, lokasi, siklus, loss dan tanggal tetap terpisah. Tanggal menggunakan Asia/Jakarta. Foto awal belum tersedia; jangan memakai foto katalog sebagai bukti unit atau menambahkan riwayat tamu palsu.

Staff/Supervisor mendapat tombol pensil + Edit memakai ws-button-secondary. Edit berlangsung di modal yang sama: Nama unit adalah field disabled/pending BE; hanya Nomor seri dan Deskripsi opsional dikirim sebagai serialNumber/notes pada PATCH/item-units/[unitId]. Jenis/kode aset dan status operasional tidak menjadi field edit. Input border navy25%1px, radius6px; textarea resize-none. Simpan emas, Batal secondary; pending mengunci input, submit ganda dan penutupan. Success kembali ke detail dan refresh data. Hasil network/5xx/response tidak cocok mengunci edit sampai muat ulang, termasuk saat dialog ditutup/dibuka lagi; jangan mengirim ulang otomatis. Escape unit hanya menutup modal anak, memulihkan fokus trigger dan mempertahankan drawer jenis.

## 8. Motion dan feedback

Pola header inventory bersama (23 Oktober 2026): tombol X Phosphor44px di kanan, divider border-ws-divider, identitas utama18px/28px/600. Panel detail memakai baris konteks12px/500, divider, lalu identitas. Form Tambah unit memakai judul komposit Tambah unit — [nama jenis] di atas satu divider; nama individual muncul di accordion/ringkasan, bukan nama jenis besar yang diulang di bawah header. Ini variasi yang disetujui pemilik. Warna, target44px, focus ring dan hover tetap bersama.

Peta pemakaian: inventory/inventory-drawer.tsx menyediakan baris konteks panel; inventory/add-stock-dialog.tsx menyediakan baris konteks form. components/item-name-disclosure.tsx dipakai oleh inventory/page.tsx (heading h2, units-heading) dan form Tambah unit (heading h3, add-stock-item). Jika mengubah gaya nama/disclosure, ubah komponen bersama supaya dua pemakaian ikut selaras. Chevron Phosphor caretRight berputar90derajat saat terbuka,150ms; reduced-motion mematikan transisi. Nama hanya muncul sekali dalam DOM. Header form tetap terlihat saat isi scroll; drawer tetap memakai perilaku scroll existing. Jangan mengubah header login atau dialog edit yang tidak menampilkan konteks nama ini secara otomatis.

| Interaksi | Durasi | Teknik |
| --- | --- | --- |
| Sidebar desktop 288 ↔ 72px | 420ms | grid-template-columns |
| Sidebar mobile/panel kanan masuk | 420ms | translateX dari tepi |
| Sidebar mobile/panel kanan keluar | 280ms | translateX menuju tepi |
| Background menu aktif naik/turun | 380ms | transform satu background bersama |
| Hover warna navigasi | 150ms | transition-colors |

Easing slide cubic-bezier(0.16, 1, 0.3, 1). Helper `src/lib/panel-motion.ts` memakai Web Animations API dan membatalkan animasi lama ketika diganti/unmount. prefers-reduced-motion mematikan pergerakan. Tutup dialog dan pulihkan body scroll sebelum menunggu response navigasi pelepasan selection.

Tunggu data/server tidak sama dengan durasi animasi. Gunakan pending label yang jujur; jangan mengklaim optimasi backend dari perubahan motion. Tidak ada animasi metrik atau loop dekoratif. Pengukuran lokal sebelumnya masih menunjukkan satu frame 68ms; ini bukan jaminan performa produksi.

## 9. Login

Pertahankan layout dan aset hotel yang disetujui. Spesifikasi rinci serta asal aset: `LOGIN-DESIGN.md`, dengan bagian kondisi aktif sebagai acuan.

- Desktop dua kolom, pengantar di kiri dan form maksimum 400px di kanan. Di bawah 768px pengantar disembunyikan: form-only, memakai background portrait existing.
- Background hotel dengan overlay navy 80%. Panel navy 40%, backdrop-blur-md (12px), border putih 20%, radius 8px; fallback navy 95%. Padding 24px mobile/32px desktop.
- Input navy 25%, backdrop-blur-sm (8px), border putih 20%; fallback 95%. Label/input putih, teks sekunder #BEC6E0, fokus #FE932C. Tinggi input/submit minimum 48px.
- Tombol Masuk #904D00, hover #753E00, teks putih. Emblem putih dari filter existing. Pertahankan aset, spacing, heading dan copy yang sudah disetujui.
- Pemilik menghapus Tampilkan/Sembunyikan; password selalu type=password, padding horizontal 12px. Jangan menambahkan eye icon atau kontrol reveal kembali tanpa permintaan.
- Label nyata, autocomplete, required, disabled/pending, error alert, submit dan redirect tetap menggunakan implementasi existing. Tidak mengubah autentikasi demi desain.

## 10. Komponen, state dan aksesibilitas

- Tombol primary memakai primary/white, hover primary-hover. Tombol secondary berpermukaan terang wajib memakai utility Tailwind bersama `ws-button-secondary` di src/app/globals.css: default inset #EFF4FF, teks strong #0B1C30, border1px navy #131B2E/20%, radius6px, tinggi minimum44px, font14px/20px/500, tracking0.01em. Hover aktif memakai background dan border deep navy #131B2E dengan teks putih, transisi150ms; reduced-motion tanpa transisi. Toggle aria-pressed=true mempertahankan state navy. Focus outline2px primary, offset2px. Disabled tidak berubah saat hover, opacity60%, cursor not-allowed; pending boleh cursor-wait. Jangan menambahkan border, font atau hover lokal yang menimpa utility ini.
- Peta secondary: inventory/page.tsx (Cari, Detail barang kartu/tabel, pagination, navigasi unit dan kembali/reset pencarian), edit-item-dialog.tsx (Edit/Batal/Tutup), add-stock-dialog.tsx (Batal/Tutup), create-item-dialog.tsx (Pilih foto/Batal), inventory-view.tsx (Kartu/Tabel). Consumer baru, termasuk Edit unit, wajib memakai utility yang sama. Primary emas, login, sidebar dan kontrol ikon transparan X/chevron/logout mempertahankan pola masing-masing. Input, badge, metadata dan accordion bukan tombol secondary.
- Cursor pointer untuk tombol aktif, role=button, select, summary dan input aksi. Tombol/select nonaktif memakai not-allowed; utility pending cursor-wait tetap mengungguli aturan base. Link href tetap cursor pointer native. Jangan mengubah input teks menjadi cursor tangan atau membuat seluruh baris noninteraktif terlihat clickable.
- Validasi form inventory memakai noValidate untuk meniadakan popup bawaan browser, sambil mempertahankan required/min/max/step/maxLength dan validasi server. Pakai useInventoryForm + inventory-form-validation + FieldError bersama. Pesan Bahasa Indonesia berupa p merah di bawah field,12px/20px, role=alert, aria-invalid dan aria-describedby. Submit invalid tidak mengirim request; fokus ke field pertama, membuka accordion bila perlu. Pesan diperbarui saat input diperbaiki. Pemakaian saat ini: create/edit jenis, Tambah unit, Edit unit; login tetap scope terpisah. Jangan memanggil reportValidity atau mengandalkan warna saja.
- Form inventory memberi tanda * pada label wajib dan satu keterangan * Wajib diisi. Marker visual aria-hidden, sedangkan required native tetap otoritas aksesibilitas/validasi. Field opsional diberi (opsional), tanpa *. Saat ini mencakup nama jenis, jumlah, kondisi unit, foto/deskripsi katalog dan serial/deskripsi unit; tidak mengganti layout login yang sudah disetujui.
- Target tindakan minimum 44px, login minimum 48px. Icon-only wajib accessible name; ikon dekoratif disembunyikan dari pembaca layar. Gunakan sistem ikon existing Figma/Phosphor, bukan emoji atau ikon baru yang tidak konsisten.
- Input berlabel, border control yang terbaca, placeholder text yang cukup kontras. Search tetap tersedia di ponsel; min-width:0 mencegah overflow.
- Status memiliki teks; jumlah tidak disampaikan lewat warna saja. Target WCAG: teks normal minimal 4.5:1, teks besar/ikon penting 3:1. Nilai token saja bukan sertifikasi seluruh state; cek rendered output.
- Pertahankan skip link, urutan keyboard, live pending/error, focus-visible, native dialog focus, reduced motion dan scrolling.
- Loading: skeleton mengikuti komposisi final dan label status. Empty/no-result: pesan konkret dan recovery yang relevan. Error: pesan serta Coba lagi yang memanggil reset existing. Jangan membuat sukses palsu atau fixture produksi.
- Form/dialog mutasi, toast, dropdown dan tabs fitur berikutnya mengikuti token, skala, focus dan bahasa di sini, tetapi spesifikasi alur/detailnya perlu disesuaikan dengan fitur nyata. Dokumen ini tidak menyatakan semua komponen itu sudah dibuat.

### Form tambah jenis barang — implementasi pertama

Tombol Tambah jenis barang di kanan header katalog, full width saat mobile. Tampil hanya jika role memenuhi inventory:item:create; API tetap otoritas izin. Form client terisolasi menggunakan POST /api/items yang diperluas secara kompatibel untuk deskripsi/foto atas keputusan pemilik; tidak membuat Server Action paralel.

Dialog native terpusat, maksimum 512px, lebar viewport minus 32px, tinggi maksimum viewport minus 32px, overflow-y:auto. Surface putih, radius 8px, backdrop hitam 35%, padding 24px mobile/32px desktop. Judul 20/28px 600; isi 14/24px; input minimal 44px, nama maksimum 100 karakter. Tidak memakai glass pada form workspace.

Field: Nama jenis barang, Deskripsi opsional (textarea tiga baris, maksimum2000), Foto katalog opsional (JPEG/PNG/WebP statis, maksimum2MiB). Pemilih berlabel Pilih foto/Belum ada foto dipilih dan menyediakan preview object-contain; tidak memakai label browser berbahasa Inggris. Create memakai multipart endpoint existing yang telah diperluas. Quantity/kategori tetap tidak masuk form jenis. Aksi Batal dan Simpan jenis barang menggunakan peran tombol existing. Form fokus ke nama saat dibuka; native dialog menahan fokus. Batal/Escape memulihkan fokus dan scrolling. Selama pending, field/tombol disabled, Escape dicegah, submit ganda ditahan dan label Menyimpan…. Escape form tidak boleh menutup panel unit di belakangnya.

Duplikat409, validasi400 dan upload413 mempertahankan input agar dapat diperbaiki;401 menawarkan Ke halaman masuk,403 menjelaskan izin. Gangguan koneksi/5xx bukan sukses. Setelah201, pesan persis Jenis barang berhasil ditambahkan. Form menutup dan katalog diarahkan ke q=nama baru yang dinormalisasi, page=1, lalu direfresh; ini sengaja mengganti pencarian/selection sebelumnya agar kartu hasil langsung terlihat meskipun urutan katalog alfabetis. Jangan mengubah backend sort untuk memaksa barang baru ke halaman pertama default.

Reserve 440px desktop hanya mengikuti #inventory-unit-panel[open], bukan semua dialog. Form create tidak boleh menggeser katalog.

### Tambah stok — kontrol + dan form

Tombol + persegi44×44px, radius6px, primary #904D00/putih dengan hover #753E00. Tempatkan tepat di kanan Detail barang pada kartu; tabel mempertahankan aksi yang sama dengan kolom cukup lebar. Di panel detail, tombol full-width berada setelah count dan sebelum tabel; ikon + serta teks Tambah stok digabung di dalam satu tombol, bukan teks terpisah di atas/bawahnya. Accessible name menyertakan nama jenis. Bentuk plus memakai geometri sederhana yang konsisten dengan ikon existing. Tampil hanya untuk inventory:stock:add pada jenis aktif; backend tetap menolak item nonaktif/perubahan izin.

Satu StockRegistrationProvider mengelola dialog bersama dari kartu/tabel/panel. Native modal flat putih maksimum672px, gutter12px, padding20/28px, radius8px, backdrop35%; header/footer tetap terlihat, isi scroll. Judul Tambah unit — [nama jenis], tanpa judul jenis duplikat. Jumlah1–100 wajib tanpa spinner; helper 1-100 unit per penambahan. Jumlah/lokasi sejajar mulai640px, bertumpuk di bawahnya. Lokasi awal * sekali per batch dari lokasi aktif database; tanpa default dan daftar kosong memblokir simpan.

Accordion per unit memakai judul urutan — nama unit atau nama jenis — nomor seri atau Tanpa nomor seri, maksimum dua baris; urutan mulai1 per penambahan. Maksimal satu accordion terbuka; perubahan jumlah menutup semuanya dan membuang label/isian hanya untuk unit yang dikeluarkan. Field: Nama unit disabled(pending BE), Kondisi unit *(default Baik), Nomor seri opsional, Deskripsi opsional. Nama unit saat ini disabled dengan pesan menunggu BE dan tidak dikirim/disimpan; deskripsi di notes; tidak ada field kondisi global. Textarea resize-none. Kode/kesiapan tetap server-derived, non-GOOD menunggu inspeksi; lokasi initialLocationId berlaku untuk seluruh batch. Kontrak batch dan canonical hash backend existing tidak diubah.

POST /api/stock-batches mempertahankan requestId UUID dan seluruh payload serial/deskripsi/kondisi/lokasi jika hasil belum pasti; input dibekukan saat retry dan semua tombol + membuka batch tertunda yang sama. Pending mencegah Escape/batal/double-submit. Respons200 replay/201 harus cocok id/itemId/jumlah; baru tampil Penambahan unit berhasil, jumlah terkonfirmasi dan tabel No./Nama unit/Nomor seri dari payload yang dikonfirmasi. Nama kosong memakai nama jenis; seri kosong Tanpa nomor seri. Tabel ini ringkasan permintaan yang disimpan, bukan daftar kode aset terbaru atau bukti foto. Header tetap dan Selesai pada footer kanan; tidak menambah toast/grafik/metrik palsu. Refresh data nyata. Penolakan definitif400/401/403/404/ITEM_INACTIVE/STORAGE_UNAVAILABLE/LOCATION_UNAVAILABLE memungkinkan perbaikan; REQUEST_CONFLICT tidak membuat ID baru otomatis.

Recovery saat ini page-local, belum lintas reload/tab: pesan meminta tidak meninggalkan halaman dan beforeunload memperingatkan selama hasil belum pasti. Jangan menyebutnya recovery persisten. Scope berikutnya dapat menyimpan pending batch per akun bila diperlukan. Escape form tidak boleh menutup panel unit di belakangnya.

### Edit jenis barang

Aksi Edit dengan ikon pensil berada di kanan Tambah stok dalam satu baris setelah count unit pada panel detail jenis. Tampil hanya untuk inventory:item:update (Staff/Supervisor), termasuk jenis nonaktif sesuai backend. Aksi sekunder berbentuk button surface putih dengan border control, teks strong14px/500 dan ikon ph:pencil-simple20px; target minimal44px dan gap ikon8px. Tambah stok tetap primary emas, mengisi sisa lebar baris dengan gap8px. Jika jenis nonaktif, hanya Edit ditampilkan. Baris harus tetap muat mulai320px.

Dialog native maksimum448px, gutter16px, padding24/32px, radius8px, flat putih dan backdrop35%. Form bernama Edit, memakai EditItemDialog di edit-item-dialog.tsx. Field Nama jenis barang * required/max100 dan Deskripsi (opsional) max2000/rows3/resize-none, keduanya terisi dari jenis terpilih. FE mengirim name+description, menormalisasi trim/nama dan memvalidasi respons id/name/description; string deskripsi kosong mengharapkan null. Tombol Batal/Simpan, success Jenis barang berhasil diperbarui., Selesai dan refresh. Pending mengunci field/submit/batal/Escape; duplicate menandai nama, session expired memberi link login, unknown-result meminta muat ulang detail. Foto/status/unit tidak ikut diedit. Backend kini menerima name+description(max2000), menyimpan keduanya dalam transaksi/audit ITEM_UPDATED. Field description tidak dikirim mempertahankan nilai lama; string kosong menjadi null; no-op tidak membuat audit. Permission dan penolakan duplikat existing tetap. Tidak perlu migration. Guide output/backend-edit-item-guide.md menjadi referensi implementasi.

Dialog dirender lewat portal agar tidak terpotong panel. Event click, Escape dan cancel tidak boleh menutup panel detail di belakang; tutup mengembalikan focus dan overflow sebelumnya. Verifikasi FE sebelumnya mencakup14browser checks320/390/1366. Verifikasi koneksi BE terbaru: lint/typecheck, full21files/376tests dan9browser checks API asli/no-op/reload; persistence perubahan/penghapusan/audit/rollback/concurrency dites pada DB integration terpisah. Warna sidebar/primary diverifikasi setelah restart dev server.

### Detail jenis dan detail unit: arah yang dikonfirmasi23Oktober2026

Referensi komposisi: [Figma Detail & Manajemen Aset Inventaris, node1:2225](https://www.figma.com/design/1zcG8yCxhIVZlx50938se0/Untitled?node-id=1-2225). Metadata, design context dan screenshot dibaca lewat Figma MCP. Frame1280×1816 memiliki header/breadcrumb, ringkasan aset dengan foto, tab dan area data/detail; ini referensi struktur, bukan izin menyalin fitur/data contohnya.

- Detail jenis menampilkan nama/foto/deskripsi katalog dan kumpulan unit fisiknya. Detail unit menampilkan kode HK existing untuk satu unit, nama jenis induk, foto unit, nomor seri opsional, deskripsi unit, lokasi dan dimensi status yang tetap terpisah. Jangan memakai kode master Figma sebagai kode fisik atau menggabungkan semua unit menjadi satu stok counter.
- Pola header/ringkasan, pengelompokan data dan tab mengikuti referensi dengan token workspace/Inter yang sudah disetujui. Penempatan riwayat dalam detail unit dikonfirmasi; bentuk route, breakpoint dan komponen final menyusul pada slice implementasi. Drawer existing tetap entry yang berfungsi sampai pengganti/navigasi lengkap siap.
- Riwayat unit menggabungkan event registrasi, koreksi, peminjaman/pengembalian dan kondisi sesuai backend yang benar-benar tersedia. Foto menjadi lampiran pada event terkait, dengan waktu/petugas/keterangan; tidak ada menu Riwayat foto terpisah. Nama tamu dan waktu transaksi hanya berasal dari record nyata saat modul terkait tersedia.
- Foto katalog jenis terpisah dari bukti unit. Form Tambah stok memerlukan minimal satu foto awal per unit baru; upload yang belum disimpan boleh diganti/dihapus, bukti tersimpan tidak ditimpa. Unit lama yang belum punya bukti memakai keterangan Foto awal belum tersedia, bukan foto contoh atau tanggal palsu.
- Contoh proposal presentasi: ringkasan unit di atas, detail status terbaca, lalu Riwayat unit dengan lampiran foto yang dapat dibuka. Tampilan desktop/tablet/mobile harus tetap operasional; hanya aksi yang punya endpoint/izin yang ditampilkan sebagai controls aktif. Ini arahan, belum implementasi.
- Jangan menyalin barcode/QR/NFC, distribusi pantry, okupansi, harga penggantian, SOP checklist, assignment, ekspor atau statistik contoh dari frame sebagai fitur baru. Keputusan scope PROJECT dan user tetap berlaku; foto Figma tidak boleh disimpan sebagai bukti kondisi unit hotel.

Status: backend saat ini baru memiliki audit/history unit tanpa relasi/upload bukti foto. Fondasi BE foto dan integrasi Add Stock diperlukan sebelum field wajib/riwayat foto FE dapat dinyatakan berfungsi. Belum ada schema/API/component foto unit yang ditambahkan oleh keputusan ini.

## 11. Dashboard dan scope bisnis

Statistik peminjaman/okupansi contoh diizinkan pemilik hanya dengan label Data demonstrasi dan penjelasan belum terhubung ke data hotel. Jangan membuat aktivitas tamu, notifikasi, stok tersedia atau kontrol operasional palsu. Dashboard masih memiliki temuan audit duplikasi breakdown dan metadata tab starter; belum ada persetujuan perubahan itu dalam slice ini.

Aplikasi independen tanpa PMS sync. Nama tamu, nomor kamar dan nomor booking dimasukkan manual sesuai PROJECT; form/backend yang belum dibuat bukan masalah styling. Barcode, distribusi pantry dan kategori tidak termasuk implementasi ini. Ekspor report adalah pekerjaan berikutnya. Create jenis dengan foto/deskripsi dan Add Stock frontend kini tersedia. Edit nama/deskripsi jenis existing tersedia lewat PATCH yang sudah diaudit. Edit foto jenis existing, koreksi unit, deactivation review dan selected-unit history frontend masih menjadi slice terpisah.

## 12. Panduan penerimaan dan implementasi berikutnya

1. Baca dokumen ini, PROJECT yang relevan, CONTEXT dan source aktual sebelum mengubah UI. Preserve dirty work dan fungsi di luar screenshot.
2. Gunakan Tailwind/token existing; jangan kembali ke palet crimson/brass atau memasang glass ke semua kartu. Figma menjadi acuan visual bersama override pemilik di atas.
3. Periksa 320/390px, tablet 768px, desktop 1280/1366px, dan mode panel 1440px. Uji sidebar ciut, nama panjang, loading/empty/error/pending, keyboard dan reduced motion. Lebar kartu tidak berubah hanya karena sidebar berubah.
4. Jalankan lint/typecheck serta test yang relevan. Browser screenshot harus ditinjau; bandingkan computed typography/geometry untuk keluhan visual spesifik. Jangan mengklaim build/integration/logout passed jika tidak dijalankan.
5. Catat hasil aktual di DEVLOG dan refresh CONTEXT; perubahan spesifikasi aktif masuk dokumen ini, bukan sekadar menambah catatan override yang saling bertentangan.
6. Tidak mengubah backend/auth/schema/permission atau menambah data palsu demi fidelity. Jangan switch branch, commit atau mengakses aset eksternal tanpa otorisasi yang sesuai.

Referensi render lokal (bukti review, bukan aset produksi): `../output/playwright/catalog-centered-1366.png`, `login-without-reveal.png`, `refinement-mobile-menu.png`, `refinement-panel-1440.png`. Screenshot memakai data uji lokal dan mungkin belum menunjukkan revisi tombol paling baru. Preview generatif `../design-previews/inventory-crimson-contextual-v2.png` hanya sejarah komposisi, bukan arah warna aktif.
