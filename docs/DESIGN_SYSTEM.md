# Housekeeping — arah desain aplikasi

Spesifikasi aktif, disinkronkan 23 Oktober 2026 terhadap source commit a0eb555 dan dikonsolidasikan dari keputusan pemilik, Figma yang disetujui, dan revisi implementasi terakhir. Gunakan dokumen ini untuk UI berikutnya. `PROJECT.md` tetap sumber aturan bisnis; desain tidak mengubah permission, kontrak API, autentikasi, atau invariant unit fisik.

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
- Revisi27Oktober2026: area foto/placeholder kartu memakai rasio4:3 (198px pada lebar264px). Foto kartu katalog memakai object-cover tanpa padding agar mengisi kotak; gambar utuh tersedia di detail. Foto detail dan evidence tetap object-contain. Loading skeleton mengikuti ukuran dan alignment grid yang sama.
- Foto katalog opsional kini tersedia saat create jenis barang. Render foto nyata dari photoUrl berizin dengan object-contain; tampilkan Foto belum tersedia hanya saat photoUrl kosong. Jangan memakai stock photo palsu sebagai data produk. Penyimpanan: ITEM-CATALOG-STORAGE.md.
- Badge Aktif/Nonaktif di kanan atas. Nama berada dalam lane 40px, pendek rata tengah vertikal, panjang maksimum dua baris 20px. Nama lengkap tersedia dari title dan disclosure detail jika sangat panjang.
- Metadata Diperbarui berada di drawer detail jenis barang, bukan kartu/tabel. Tombol bernama Detail barang pada kartu maupun tabel, accessible name menyertakan nama barang; saat navigasi pending Memuat detail…. Tombol tetap membuka data unit existing, bukan fitur detail baru yang belum tersedia.
- Pada tabel gunakan header/kolom sejajar, status berlabel, tanggal tabular dan aksi yang tetap terjangkau. Metadata sekunder berpindah ke identitas pada layar sempit; jangan menghilangkan data/fungsi untuk meniru Figma.
- Pagination berlabel Sebelumnya/Berikutnya dan range nyata; tombol batas disabled. Pertahankan penanganan input invalid, tidak ada hasil, item hilang, dan error service.

## 7. Panel kanan detail barang/unit

- Mulai viewport 1440px: native dialog nonmodal 440px di kanan, di bawah header 64px, konten utama menyisakan 440px selama dialog terbuka. Close mengembalikan layout katalog.
- Di bawah 1440px: modal 440px dengan backdrop hitam 35%. Di bawah 640px: full width. Panel dapat scroll; nama panjang tidak boleh membuat overflow horizontal.
- Header Jenis barang terpilih, judul nama jenis tanpa prefiks Unit fisik, foto/deskripsi jika ada, count Unit fisik terdaftar, toolbar count + Tambah unit, lalu tabel unit. Hapus dua kalimat penjelasan lama di bawah count; label count tetap menyatakan unit terdaftar, bukan stok siap dipinjam.
- Nama jenis memakai komponen bersama ItemNameDisclosure, sama seperti form Tambah unit. Nama lebih dari80karakter diringkas dua baris; kontrol chevron di kanan membuka nama lengkap di tempat yang sama tanpa paragraf duplikat. Tidak memakai teks Selengkapnya/Ringkas yang terlihat; aksi tetap berlabel untuk pembaca layar. Nama pendek tampil tanpa disclosure.
- Daftar unit memakai tiga kolom: No.(32px), Unit fisik, Detail & status; empty-state colspan3. Nomor adalah urutan tampilan pada halaman cursor saat ini, bukan identitas permanen. Baris diringkas dengan padding vertikal12px: identitas utama nama → seri → kode aset, satu baris metadata sekunder, kondisi/kesiapan/lokasi serta peringatan loss. Deskripsi panjang, penguasaan dan siklus dipindahkan ke detail unit, bukan dihapus dari data. Tombol identitas tetap target44px dan nama maksimum dua baris. Jangan menggabungkan dimensi status atau menganggap aktif berarti siap dipinjam.
- Close, Escape dan backdrop bekerja sesuai mode; pertahankan normalized search/page saat melepas selection. Kembalikan fokus ke trigger yang masih terpasang. Native modal menangani fokus dan body lock.
- Panel dapat menampilkan foto katalog dan deskripsi jenis yang disimpan. Identitas unit adalah tombol yang membuka modal detail; accessible name menyertakan nama yang terlihat dan kode aset. Search, selection jenis dan cursor tidak berubah. Riwayat audit tersedia di modal detail unit melalui UnitHistory: 10 aktivitas per halaman, waktu Asia/Jakarta/WIB dan petugas, disclosure perubahan serial/deskripsi, loading, kosong, error/retry dan tautan login bila sesi berakhir. Gunakan ws-button-secondary untuk pagination; request lama dibatalkan saat unmount/pergantian halaman. Riwayat tamu dan foto menunggu backend terkait, tanpa data buatan.

Detail/edit unit23Oktober: inventory/unit-details-dialog.tsx menampilkan modal maksimum576px, gutter12px, padding20px/24px, header konteks + X44px + divider + identitas utama (nama unit → nomor seri → kode HK). Prioritas ini memakai helper unitDisplayName di src/lib/unit-display-name.ts, juga dipakai daftar unit. Nama jenis tetap konteks sekunder. Kode aset HK ditampilkan sebagai fakta sekunder; UUID tetap PK database. Fakta ditata dua kolom dengan label12px dan nilai14px; teks membungkus aman, modal dapat scroll. Nomor seri, kondisi, kesiapan, penguasaan, lokasi, siklus, loss dan tanggal tetap terpisah. Tanggal menggunakan Asia/Jakarta. Foto awal belum tersedia; jangan memakai foto katalog sebagai bukti unit atau menambahkan riwayat tamu palsu.

Staff/Supervisor mendapat tombol pensil + Edit memakai ws-button-secondary. Edit berlangsung di modal yang sama: Nama unit opsional/max100 aktif; nama, nomor seri dan deskripsi dikirim sebagai name/serialNumber/notes pada PATCH/item-units/[unitId]. Jenis/kode aset dan status operasional tidak menjadi field edit. Input border navy25%1px, radius6px; textarea resize-none. Simpan emas, Batal secondary; pending mengunci input, submit ganda dan penutupan. Success kembali ke detail dan refresh data. Hasil network/5xx/response tidak cocok mengunci edit sampai muat ulang, termasuk saat dialog ditutup/dibuka lagi; jangan mengirim ulang otomatis. Escape unit hanya menutup modal anak, memulihkan fokus trigger dan mempertahankan drawer jenis.

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

### Tambah unit — kontrol + dan form

Tombol + pada kartu44×44px, radius6px, primary #904D00/putih dengan hover #753E00. Tempatkan di kanan Detail barang. Pada tabel, kedua aksi sejajar36px; +36×36px/padding0/ikon16px. Di panel detail, count dan Tambah unit satu toolbar; tombol emas160px/max-width100%, ikon+ dan teks berada dalam tombol yang sama. Accessible name menyertakan nama jenis. Bentuk plus memakai geometri sederhana yang konsisten dengan ikon existing. Tampil hanya untuk inventory:stock:add pada jenis aktif; backend tetap menolak item nonaktif/perubahan izin.

Satu StockRegistrationProvider mengelola dialog bersama dari kartu/tabel/panel. Native modal flat putih maksimum672px, gutter12px, padding20/28px, radius8px, backdrop35%; header/footer tetap terlihat, isi scroll. Judul Tambah unit — [nama jenis], tanpa judul jenis duplikat. Jumlah1–100 wajib tanpa spinner; helper 1-100 unit per penambahan. Jumlah/lokasi sejajar mulai640px, bertumpuk di bawahnya. Lokasi awal * sekali per batch dari lokasi aktif database; tanpa default dan daftar kosong memblokir simpan.

Accordion per unit memakai judul urutan — nama unit atau nama jenis — nomor seri atau Tanpa nomor seri, maksimum dua baris; urutan mulai1 per penambahan. Maksimal satu accordion terbuka; perubahan jumlah menutup semuanya dan membuang label/isian hanya untuk unit yang dikeluarkan. Field: Nama unit opsional/max100 (BE/FE terhubung26Oktober, checks FE pending owner), Kondisi unit *(default Baik), Nomor seri opsional, Deskripsi opsional. Nama unit FE aktif; helper normalizeUnitName menyamakan trim/collapse whitespace dan null untuk kosong. Nama ikut payload batch frozen, judul accordion serta ringkasan sukses; deskripsi di notes; tidak ada field kondisi global. Textarea resize-none. Kode/kesiapan tetap server-derived, non-GOOD menunggu inspeksi; lokasi initialLocationId berlaku untuk seluruh batch. Kontrak batch lama tetap valid. Backend26Oktober menyertakan name terisi pada canonical hash; nama kosong/null/omitted mempertahankan hash lama.

POST /api/stock-batches mempertahankan requestId UUID dan seluruh payload serial/deskripsi/kondisi/lokasi jika hasil belum pasti; input dibekukan saat retry dan semua tombol + membuka batch tertunda yang sama. Pending mencegah Escape/batal/double-submit. Respons200 replay/201 harus cocok id/itemId/jumlah; baru tampil Penambahan unit berhasil, jumlah terkonfirmasi dan tabel No./Nama unit/Nomor seri dari payload yang dikonfirmasi. Nama kosong memakai nama jenis; seri kosong Tanpa nomor seri. Tabel ini ringkasan permintaan yang disimpan, bukan daftar kode aset terbaru atau bukti foto. Header tetap dan Selesai pada footer kanan; tidak menambah toast/grafik/metrik palsu. Refresh data nyata. Penolakan definitif400/401/403/404/ITEM_INACTIVE/STORAGE_UNAVAILABLE/LOCATION_UNAVAILABLE memungkinkan perbaikan; REQUEST_CONFLICT tidak membuat ID baru otomatis.

Recovery saat ini page-local, belum lintas reload/tab: pesan meminta tidak meninggalkan halaman dan beforeunload memperingatkan selama hasil belum pasti. Jangan menyebutnya recovery persisten. Scope berikutnya dapat menyimpan pending batch per akun bila diperlukan. Escape form tidak boleh menutup panel unit di belakangnya.

### Edit jenis barang

Aksi Edit dengan ikon pensil berada di kanan identitas nama jenis pada panel detail. Tampil hanya untuk inventory:item:update (Staff/Supervisor), termasuk jenis nonaktif sesuai backend. Aksi memakai ws-button-secondary dengan teks14px/500, ikon pensil20px, target44px dan gap8px. Count dan Tambah unit emas160px berada pada toolbar terpisah di bawah identitas/deskripsi. Jenis nonaktif tidak mendapat Tambah unit; Edit tetap tersedia. Baris harus tetap muat mulai320px.

Dialog native maksimum448px, gutter16px, padding24/32px, radius8px, flat putih dan backdrop35%. Form bernama Edit, memakai EditItemDialog di edit-item-dialog.tsx. Field Nama jenis barang * required/max100 dan Deskripsi (opsional) max2000/rows3/resize-none, keduanya terisi dari jenis terpilih. FE mengirim name+description, menormalisasi trim/nama dan memvalidasi respons id/name/description; string deskripsi kosong mengharapkan null. Form memakai Batal/Simpan. Success Jenis barang berhasil diperbarui. menyusutkan dialog menjadi satu baris maksimum384px/padding16px dengan X44px, tanpa judul terlihat atau tombol Selesai; fokus pindah ke X dan data direfresh. Pending mengunci field/submit/batal/Escape; duplicate menandai nama, session expired memberi link login, unknown-result meminta muat ulang detail. Foto/status/unit tidak ikut diedit. Backend kini menerima name+description(max2000), menyimpan keduanya dalam transaksi/audit ITEM_UPDATED. Field description tidak dikirim mempertahankan nilai lama; string kosong menjadi null; no-op tidak membuat audit. Permission dan penolakan duplikat existing tetap. Tidak perlu migration. Guide output/backend-edit-item-guide.md menjadi referensi implementasi.

Dialog dirender lewat portal agar tidak terpotong panel. Event click, Escape dan cancel tidak boleh menutup panel detail di belakang; tutup mengembalikan focus dan overflow sebelumnya. Verifikasi FE sebelumnya mencakup14browser checks320/390/1366. Verifikasi koneksi BE terbaru: lint/typecheck, full21files/376tests dan9browser checks API asli/no-op/reload; persistence perubahan/penghapusan/audit/rollback/concurrency dites pada DB integration terpisah. Warna sidebar/primary diverifikasi setelah restart dev server.

### Detail jenis dan detail unit: arah yang dikonfirmasi23Oktober2026

Referensi komposisi: [Figma Detail & Manajemen Aset Inventaris, node1:2225](https://www.figma.com/design/1zcG8yCxhIVZlx50938se0/Untitled?node-id=1-2225). Metadata, design context dan screenshot dibaca lewat Figma MCP. Frame1280×1816 memiliki header/breadcrumb, ringkasan aset dengan foto, tab dan area data/detail; ini referensi struktur, bukan izin menyalin fitur/data contohnya.

- Detail jenis menampilkan nama/foto/deskripsi katalog dan kumpulan unit fisiknya. Detail unit menampilkan kode HK existing untuk satu unit, nama jenis induk, foto unit, nomor seri opsional, deskripsi unit, lokasi dan dimensi status yang tetap terpisah. Jangan memakai kode master Figma sebagai kode fisik atau menggabungkan semua unit menjadi satu stok counter.
- Pola header/ringkasan, pengelompokan data dan tab mengikuti referensi dengan token workspace/Inter yang sudah disetujui. Penempatan riwayat dalam detail unit dikonfirmasi; bentuk route, breakpoint dan komponen final menyusul pada slice implementasi. Drawer existing tetap entry yang berfungsi sampai pengganti/navigasi lengkap siap.
- Riwayat unit menggabungkan event registrasi, koreksi, peminjaman/pengembalian dan kondisi sesuai backend yang benar-benar tersedia. Foto menjadi lampiran pada event terkait, dengan waktu/petugas/keterangan; tidak ada menu Riwayat foto terpisah. Nama tamu dan waktu transaksi hanya berasal dari record nyata saat modul terkait tersedia.
- Foto katalog jenis terpisah dari bukti unit. Form Tambah unit wajib minimal satu foto awal per unit baru; BE multipart sudah tersedia. Upload yang belum disimpan boleh diganti/dihapus, bukti tersimpan tidak ditimpa. Pencatatan awal unit lama tanpa foto diberi keterangan pada event terkait, bukan foto contoh atau tanggal palsu.
- Contoh proposal presentasi: ringkasan unit di atas, detail status terbaca, lalu Riwayat unit dengan lampiran foto yang dapat dibuka. Tampilan desktop/tablet/mobile harus tetap operasional; hanya aksi yang punya endpoint/izin yang ditampilkan sebagai controls aktif. Ini arahan, belum implementasi.
- Jangan menyalin barcode/QR/NFC, distribusi pantry, okupansi, harga penggantian, SOP checklist, assignment, ekspor atau statistik contoh dari frame sebagai fitur baru. Keputusan scope PROJECT dan user tetap berlaku; foto Figma tidak boleh disimpan sebagai bukti kondisi unit hotel.

Status26Oktober: BE foto awal wajib/storage/metadata/private read/history sudah masuk commit a0f6901 dan owner melaporkan checks passed. Field foto serta rendering lampiran FE diterapkan setelahnya, menunggu checks/manual owner. Foto hanya tampil dari lampiran event nyata.

Standar field foto unit: label Foto awal unit + *, input beberapa file, tombol secondary Pilih foto/Ganti foto, jumlah pilihan, Hapus pilihan sebelum simpan, thumbnail96×80 dan nama file terpotong dengan title. Error inline memakai FieldError/aria; validasi membuka accordion yang bermasalah. Tidak menambahkan warna, ikon atau area dekoratif baru. JPEG/PNG/WebP statis2MiB per foto, metadata256KiB, total multipart16MiB termasuk framing. Pilihan File dan urutan per unit tetap pada attempt saat retry; tidak menyimpan foto di localStorage. Object URL pratinjau dibuang saat diganti/unmount.

Standar lampiran history: thumbnail112×96 di bawah event terkait, lazy image tanpa optimizer untuk mempertahankan akses privat, buka file asli di tab baru dengan label aksesibel. Sediakan status memuat, gagal muat dan Coba lagi. Jangan tampilkan aksi menghapus/mengganti foto finalized. URL harus cocok dengan unitId/photoId pada endpoint privat; foto katalog tidak menjadi fallback.

## 11. Dashboard dan scope bisnis

Statistik peminjaman/okupansi contoh diizinkan pemilik hanya dengan label Data demonstrasi dan penjelasan belum terhubung ke data hotel. Jangan membuat aktivitas tamu, notifikasi, stok tersedia atau kontrol operasional palsu. Dashboard masih memiliki temuan audit duplikasi breakdown dan metadata tab starter; belum ada persetujuan perubahan itu dalam slice ini.

Aplikasi independen tanpa PMS sync. Nama tamu, nomor kamar dan nomor booking dimasukkan manual sesuai PROJECT; form/backend yang belum dibuat bukan masalah styling. Barcode, distribusi pantry dan kategori tidak termasuk implementasi ini. Ekspor report adalah pekerjaan berikutnya. Create jenis dengan foto/deskripsi dan Tambah unit tersedia. Edit jenis mencakup nama/deskripsi; edit unit mencakup nama/serial/deskripsi. BE nama/foto unit sudah tersedia; integrasi foto wajib dan lampiran history FE26Oktober menunggu checks owner. Edit foto katalog dan penambahan evidence setelah registrasi belum termasuk scope ini. FE keputusan Supervisor dan pembatalan pengajuan tersambung ke endpoint existing.

## 12. Panduan penerimaan dan implementasi berikutnya

Flow tamu/pinjaman disepakati26Oktober: daftar pengunjung hanya untuk kunjungan yang hendak meminjam, bukan seluruh kedatangan hotel. Dari daftar pilih kunjungan, lalu Tambah pinjaman, pilih jenis/unit siap dan foto kondisi per unit sebelum simpan. Satu detail kunjungan mengelompokkan aktivitas pinjam/kembali pada waktu berbeda, dengan petugas/foto/status masing-masing. Pinjaman aktif berisi unit yang masih outstanding, bukan semua kunjungan STAYING. Return bisa satu per satu atau gabungan; satu unit kembali tidak menyelesaikan yang lain. Checkout tetap mengizinkan return outstanding tetapi tidak menerima pinjaman baru. Halaman tamu/pinjaman belum diimplementasikan; ini acuan flow berikutnya.

1. Baca dokumen ini, PROJECT yang relevan, CONTEXT dan source aktual sebelum mengubah UI. Preserve dirty work dan fungsi di luar screenshot.
2. Gunakan Tailwind/token existing; jangan kembali ke palet crimson/brass atau memasang glass ke semua kartu. Figma menjadi acuan visual bersama override pemilik di atas.
3. Periksa 320/390px, tablet 768px, desktop 1280/1366px, dan mode panel 1440px. Uji sidebar ciut, nama panjang, loading/empty/error/pending, keyboard dan reduced motion. Lebar kartu tidak berubah hanya karena sidebar berubah.
4. Jalankan lint/typecheck serta test yang relevan. Browser screenshot harus ditinjau; bandingkan computed typography/geometry untuk keluhan visual spesifik. Jangan mengklaim build/integration/logout passed jika tidak dijalankan.
5. Catat hasil aktual di DEVLOG dan refresh CONTEXT; perubahan spesifikasi aktif masuk dokumen ini, bukan sekadar menambah catatan override yang saling bertentangan.
6. Tidak mengubah backend/auth/schema/permission atau menambah data palsu demi fidelity. Jangan switch branch, commit atau mengakses aset eksternal tanpa otorisasi yang sesuai.

Referensi render lokal (bukti review, bukan aset produksi): `../output/playwright/catalog-centered-1366.png`, `login-without-reveal.png`, `refinement-mobile-menu.png`, `refinement-panel-1440.png`. Screenshot memakai data uji lokal dan mungkin belum menunjukkan revisi tombol paling baru. Preview generatif `../design-previews/inventory-crimson-contextual-v2.png` hanya sejarah komposisi, bukan arah warna aktif.

### Pengecualian tombol pengajuan penonaktifan — 23 Oktober 2026

Tombol pembuka Ajukan penonaktifan memakai merah semantik ws-danger (#BA1A1A), teks putih, ikon Phosphor prohibit 20px, border 1px senada, radius 6px, target minimum 44px dan gap 8px. Hover memakai merah 90%; focus ring merah dengan offset 2px, transition warna 150ms dan reduced-motion. Ini pengecualian untuk aksi penonaktifan; tombol sekunder lain tetap mengikuti hover navy. Tombol Kirim pengajuan dalam dialog tetap primer amber. Perubahan ini hanya presentasi; pengajuan tetap menunggu persetujuan Supervisor.

### Daftar pengajuan penonaktifan — 23 Oktober 2026

Route /inventory/deactivation-requests adalah bagian Inventaris; navigasi sidebar existing tetap aktif. Entry dari header katalog, tautan Riwayat pengajuan di drawer (termasuk jenis nonaktif), serta hasil/recovery dialog pengajuan. Permission baca mengikuti inventory:view, termasuk Management. Halaman Server Component memakai read service existing tanpa mengubah backend/API.

Filter status memakai popup WorkspaceFilterDropdown yang sama dengan jenis barang + Terapkan, reset halaman ke1. itemId opsional berasal dari detail jenis, bertahan saat filter/pagination berubah, dan dapat dilepas melalui Semua jenis barang. Default Menunggu keputusan, 10 pengajuan per halaman, terbaru lebih dulu; batas 1000 halaman mengikuti kontrak existing. Tidak menampilkan statistik buatan atau tombol keputusan yang belum terhubung.

Satu surface putih ber-border divider, tanpa kartu statistik. Daftar tiga kolom mulai md: jenis/alasan, pengaju/waktu, status/keputusan; di layar kecil satu kolom dengan label metadata. Nama membungkus, alasan panjang dibuka lewat disclosure native. Waktu Asia/Jakarta dengan WIB; petugas/waktu keputusan hanya dari record. Status berlabel dengan warna semantik: pending warning, approved success, rejected danger, cancelled netral. Filter, tautan aksi dan pagination memakai ws-button-secondary; loading, invalid-query, empty, error/retry dan halaman di luar rentang ditangani. Error boundary baru memakai retry sesuai dokumentasi Next.js terpasang. Approval/rejection Supervisor dan pembatalan pengaju sudah tersambung. Unit tests dan typecheck historis23Oktober passed; flow keputusan/cancellation live belum diuji lewat browser pada revisi terakhir.

### Review keputusan dan pembatalan pengajuan — 23 Oktober 2026

Pada record PENDING, Supervisor mendapat Setujui/Tolak; pengaju dengan permission pembatalan mendapat Batalkan. Management tetap read-only. Supervisor boleh menyetujui pengajuan sendiri melalui pembukaan dialog dan konfirmasi terpisah. Record terminal tidak memiliki controls mutasi.

Native dialog maksimum512px, gutter12px, header konteks + X44px + divider + ItemNameDisclosure bersama. Tampilkan pengaju, waktu Asia/Jakarta/WIB, alasan lengkap dan dampak tindakan sebelum submit. Pemicu memakai ws-button-secondary; tombol konfirmasi keputusan merah semantik, Kembali secondary, fokus awal pada Kembali. Approval menjelaskan penonaktifan jenis tanpa mengubah/menghapus unit/riwayat. Rejection/cancellation tidak menonaktifkan jenis.

Pending memblokir submit ganda, X dan Escape. Success tampil dahulu; tutup/Selesai merefresh daftar dan mempertahankan filter URL. Hasil network/5xx/response tidak cocok mengunci pengiriman, termasuk setelah tutup/buka; tawarkan muat ulang daftar, bukan retry mutasi otomatis. 401 menampilkan link login; konflik/izin/missing meminta baca data terbaru. UI permission membantu presentasi; endpoint existing tetap otoritas server. Unit test terkait termasuk dalam suite155tests23Oktober; keputusan/cancellation live belum diverifikasi browser.

### Standar navigasi halaman dan header dinamis — 23 Oktober 2026

Semua heading workspace memakai WorkspacePageHeading (src/components/workspace-page-heading.tsx). Revisi owner23Oktober: root menu sidebar (Dashboard, Inventaris, Administrasi) tidak menampilkan back, termasuk loading/error root. Hanya subhalaman/reference memberikan fallbackHref untuk mengaktifkan WorkspaceBackButton di kiri judul, termasuk invalid/loading/error subhalaman. Tampilan tombol: hanya chevron kiri Phosphor existing (caretRight diputar180), target44px, gap12px ke judul, ws-button-secondary tanpa teks terlihat, accessible name Kembali ke halaman sebelumnya. Jangan membuat varian back baru atau menggandakan tombol teks Kembali ke inventaris pada header yang sama.

Back menggunakan router.back mengikuti riwayat browser, termasuk query/filter/selection dan halaman error. Jika tab tidak memiliki riwayat sebelumnya, router.replace menuju fallback parent; daftar pengajuan memakai inventaris/jenis terpilih. Root menu tidak memiliki tombol back. Back adalah navigasi browser, bukan perintah reset filter; riwayat sebelumnya juga dapat berupa halaman masuk atau situs sebelumnya.

Header atas tetap menyebut Mövenpick Hotel, lalu breadcrumb route aktif dari src/lib/workspace-breadcrumbs.ts melalui WorkspaceBreadcrumbs. Contoh: Mövenpick Hotel / Inventaris / Pengajuan penonaktifan. Parent merupakan link, halaman terakhir aria-current=page; slash dekoratif aria-hidden. Desktop/mobile membungkus teks tanpa memotong hierarki; hamburger mobile, akun dan sidebar tetap berfungsi. Pathname menentukan konteks, query/filter tidak mengganti nama halaman.

Untuk setiap route baru: daftarkan label/hierarki di registry dan pakai shared heading pada page/loading/error. Hanya route anak/reference yang memberikan fallbackHref parent; root menu tidak memberikan fallbackHref. Jangan hard-code Portal Aset atau menebak label record/UUID dari URL. Standar ini tidak berlaku otomatis pada header dialog atau login, yang tetap memakai pola tersendiri. Error boundary inventory memakai retry sesuai dokumentasi Next.js16.4 terpasang. Verifikasi terbaru dan batas fixture browser dicatat di CONTEXT/DEVLOG; browser back lintas halaman aplikasi live belum diuji ulang pada revisi terakhir.

### Filter jenis barang dan warna aksi pengajuan — revisi23Oktober2026

Pengajuan penonaktifan pada header katalog membuka semua jenis; Riwayat pengajuan di drawer membuka route daftar yang sama dengan itemId terpilih dan status ALL. Keduanya adalah entry ke satu daftar, bukan dua workflow berbeda.

Form daftar menyediakan Jenis barang dan Status pengajuan, lalu Terapkan. ItemFilter berupa disclosure native dengan nama pilihan, pencarian katalog250ms, opsi Semua jenis barang dan pagination10 hasil dari GET/items existing. Aktif/nonaktif ikut tersedia agar riwayat tetap bisa difilter; jangan memakai daftar jenis dari pengajuan saja, memuat seluruh katalog sekaligus, atau membatasi pilihan pada50hasil pertama. Selection belum diterapkan sampai klik Terapkan; submit membawa itemId yang dipilih dan status, tanpa page supaya mulai halaman1. Semua jenis menghapus field itemId; pagination daftar mempertahankan filter. Nama pilihan awal diambil dari read service existing dan tetap terlihat ketika hasil pengajuan kosong. Lookup existing juga membaca unit di server, tetapi hanya identitas jenis dikirim ke picker; metadata endpoint terpisah tidak dibuat dalam scope FE ini.

Popup dapat ditutup dengan Escape, klik di luar atau fokus meninggalkannya; pilihan memulihkan fokus ke pemicu. Error/retry/login, kosong, pembatalan request lama dan batas halaman ikut ditangani. Pada mobile pemilih jenis satu baris penuh, status/Terapkan membungkus tanpa overflow. Surface daftar tidak memotong popup dengan overflow-hidden.

Pengecualian warna yang diminta owner: link header katalog Pengajuan penonaktifan adalah navy filled #131B2E dengan teks putih dan hover navy90%; Terapkan adalah primer emas #904D00, hover #753E00 dan teks putih. Keduanya target44px, border1px senada, radius6px,14/20px500 dan tracking.01em, focus ring serta reduced-motion mengikuti workspace. Ajukan penonaktifan (mutasi) tetap merah; secondary lain tetap light/navy-hover. Tidak mengubah API/BE.

### Konsistensi popup filter dan pagination ikon — revisi23Oktober2026

Jenis barang dan Status pengajuan memakai komponen bersama WorkspaceFilterDropdown, bukan mencampurkan popup aplikasi dengan select bawaan OS. Trigger, border navy, inset surface, radius6px, chevron Phosphor, popup putih border-divider/padding12px/shadow, search input44px dan scroll area maksimum208px sama. Opsi memakai filterOptionClass bersama, hover inset dan pilihan aktif inset/primary. Jenis barang tetap mengambil katalog paginated; status memakai lima pilihan existing dengan pencarian lokal. Pemilihan mengisi hidden field itemId/status; Terapkan tetap satu-satunya submit filter dan mereset halaman. Native details tetap menyediakan keyboard trigger, Escape/outside/blur menutup dan pemilihan memulihkan fokus.

Pagination pada popup jenis dan daftar pengajuan memakai ikon chevron kiri/kanan melalui PaginationChevron. Tombol/link44x44px, ws-button-secondary dan padding0; label terlihat Sebelumnya/Berikutnya dihilangkan tetapi aria-label spesifik konteks dan title tetap. Footer popup memakai grid44px/minmax(0,1fr)/44px, gap8px, angka halaman di tengah. Footer daftar memakai grid44px/minmax(48px,auto)/44px; grup tidak membungkus tombol satu per satu. Disabled, filter URL dan batas halaman tidak berubah. Ini standar untuk pagination yang memakai pola ini; pagination lama di area lain belum direfaktor pada slice ini.

Filter implementation correction23October: ItemFilter and StatusFilter siblings must have distinct item-/status- key namespaces while preserving applied URL state in each key. WorkspaceFilterDropdown receives ReactNode children; never invoke a render callback with a ref-reading close function. Both consumers call closeFilterDropdown only in option click handlers; Escape uses the same event-based helper. DOM access/focus restoration occurs during events, outside-click refs stay inside effects/listeners. Do not suppress react-hooks/refs or console warnings to implement this pattern.

### Hierarki aksi drawer jenis barang — revisi23Oktober2026

Menggantikan susunan Edit di samping Tambah unit dan tumpukan tombol sebelum tabel. Baris identitas berisi ItemNameDisclosure yang fleksibel/min-width0 dan pensil+Edit di kanan (Staff/Supervisor, termasuk jenis nonaktif). Foto/deskripsi tetap setelah identitas. Toolbar berikutnya memisahkan metadata Unit fisik terdaftar (label12px, angka24/32px600) di kiri dan Tambah unit emas di kanan, wrapper160px/max-width100%, target44px. Border divider di atas toolbar; tanpa kartu count inset tambahan. Pada ruang sempit toolbar dapat membungkus.

Tabel unit langsung mengikuti toolbar, termasuk empty state dan cursor existing. Drawer memakai flex-column: header dan footer shrink-0, isi min-height0/flex1/overflow-y-auto. Section Pengelolaan jenis barang berada di footer terpisah dari area scroll, dengan border atas; tidak menimpa baris unit. Aksi tetap terlihat meskipun unit atau deskripsi panjang. Daftar unit mempunyai area scroll maksimum40svh dan header tabel sticky; layanan existing tetap50 unit per cursor-page, dengan link cursor di luar area scroll tabel. Riwayat pengajuan merupakan link baris44px dengan chevron kanan, menuju itemId/status ALL. Ajukan penonaktifan tetap merah dengan ikon prohibit, mengikuti lebar isi, max-width100%, rata kanan dan gap12px di bawah riwayat. Management hanya melihat data/riwayat; inactive type tidak mendapat Add unit atau pengajuan baru.

Nomor, identitas unit dan detail/status memakai padding vertikal12px, vertical-align top dan line-height20px yang sama. Trigger unit tetap minimum44px, isi diratakan atas; kode HK/metadata ada di baris kedua dalam trigger yang sama. Readiness CLEAR ditulis Siap; ON_HOLD: Belum siap; PENDING_INSPECTION: Perlu pemeriksaan; PENDING_VERIFICATION: Menunggu verifikasi. Jangan menyebutnya Bisa dipinjamkan: readiness saja belum memastikan lifecycle, penguasaan, kehilangan dan kewajiban peminjaman memenuhi syarat.

Tidak mengubah endpoint, payload atau permissions. Aturan header katalog/warna navy dan filter/Terapkan tetap berlaku. Verifikasi agent23Oktober: lint/typecheck passed;18 file/152 unit test passed;52 assertion Playwright pada fixture source aktual dengan read service/router terisolasi, termasuk50 unit, desktop/HP320–1440px, nama panjang, kosong dan Management. Screenshot desktop/HP diperiksa. Ini bukan verifikasi login, database atau persistence aplikasi live; tidak ada mutasi DB.

### Konfirmasi edit dan reset filter — 23 Oktober 2026

Konfirmasi Edit jenis barang tetap di dialog yang sama, tetapi sesudah berhasil menjadi satu baris pesan14/20px dan X44px. Lebar maksimum384px, padding16px; tanpa judul Edit yang terlihat atau tombol Selesai besar. Fokus pindah ke X, Escape dan pemulihan fokus tetap bekerja; tidak ada auto-dismiss. Form/error/pending/hasil belum pasti tidak berubah. Ringkasan batch Tambah unit tetap mempertahankan tabel hasil yang diperlukan.

Filter pengajuan yang sudah diterapkan (itemId atau status eksplisit di URL) menampilkan X44px tepat di kanan Terapkan, memakai ws-button-secondary dan ikon close existing, aria-label/title Hapus filter. Link kembali ke route tanpa query, membersihkan jenis/status/page dan memulihkan default existing Menunggu keputusan. Pilihan yang belum diterapkan tidak memunculkan X. Label kesiapan singkat memakai Siap/Belum siap/Perlu pemeriksaan/Menunggu verifikasi; bukan label ketersediaan untuk dipinjam.

Tabel katalog: aksi Detail barang dan + wajib satu baris tanpa flex-wrap. Tinggi tombol36px (detail12px, +36x36px/padding0/ikon16px), gap8px; padding sel vertikal12px. Kolom aksi160px pada layar sempit/padding8px,208px mulai640px. Ukuran44px kartu/drawer tidak berubah. Nama panjang boleh mempertinggi baris sesuai isi; tombol tidak boleh menjadi dua tingkat.

## Detail tamu dan peminjaman (26 Oktober 2026)

Nama tamu di daftar membuka detail kunjungan. Detail memakai heading/back/breadcrumb shared, ringkasan dari read model, serta daftar unit dan waktu tiap peminjaman. Status pinjaman dibedakan dari status menginap. Angka ringkasan mencakup seluruh kunjungan; filter dan pagination hanya mengubah daftar. Data tamu/kamar saat peminjaman ditampilkan sebagai snapshot, bukan menggantikan identitas kunjungan saat ini.

Tambah pinjaman mengikuti dialog existing: konteks + X, divider, identitas tamu/kamar, body scroll, footer simpan tetap terlihat. Pilihan jenis menggunakan dropdown pencarian existing, unit memakai checkbox dengan identitas nama/seri/kode HK. Pilihan bertahan saat berganti jenis/halaman. Setiap unit terpilih mempunyai accordion foto kondisi saat diserahkan; membuka unit baru menutup accordion lain tanpa menghapus pilihan foto. Validasi merah inline dan fokus ke foto yang belum lengkap. Primary emas, secondary hover navy, ikon existing, tanpa gaya baru. Hasil belum pasti mempertahankan request dan foto untuk retry; tidak menampilkan sukses sebelum response terkonfirmasi. Implementasi terbaru masih menunggu checks owner dan browser setelah migration development tersedia.

Pengembalian dan checkout (27 Oktober 2026): aksi berada di header detail tamu bersama Tambah pinjaman; kembali terima barang tetap tersedia sesudah checkout selama ada outstanding. Form return mengikuti dialog pinjaman720px dengan header/footer tetap dan body scroll. Picker10 unit/halaman, pilihan lintas halaman/occasion, maksimal100. Lokasi penerimaan satu per batch dengan override unit; default kondisi tercatat, foto opsional untuk Baik dan wajib untuk non-Baik. Pilihan Baik tidak muncul jika kondisi tercatat non-Baik; validasi transisi di BE masih pending. Foto draft tetap saat accordion ditutup. Checkout memakai dialog konfirmasi480px, jumlah outstanding nyata dan checkbox eksplisit sebelum lanjut jika masih ada pinjaman. Server409 memperbarui jumlah dan meminta konfirmasi lagi. Riwayat memberi kelompok foto terpisah untuk issue dan return, beserta kondisi, lokasi dan petugas penerimaan; tanpa foto tambahan yang dibuat-buat. Tidak ada auto-dismiss berbasis timer. Visual dan alur live baru belum diverifikasi owner.

## Revisi layout operasional (27 Oktober 2026)

Katalog memakai tinggi viewport di bawah header64px: judul/aksi, pencarian, toggle tampilan dan pagination tetap di luar area hasil yang scroll. Drawer mempertahankan konteks/nama/Edit di header serta pengajuan di footer; body berisi metadata, foto, deskripsi dan unit. Header workspace sticky agar offset drawer desktop tidak meninggalkan celah ketika halaman digulir. Pada viewport pendek halaman boleh bertambah tinggi agar kontrol tetap terjangkau.

Dialog form memakai root flex dengan batas tinggi viewport dan overflow-hidden, header/footer shrink-0, serta body min-h-0 dan overflow-y-auto. Form di antaranya juga min-h-0/flex-col; jangan menggulir root dialog atau menempatkan footer di dalam body scroll. File input menghentikan propagasi cancel melalui listener native dengan cleanup pada usePhotoSelection; props JSX onCancel hanya dipakai pada dialog karena tipe input tidak mendukungnya. Berlaku untuk tambah/edit jenis, detail/edit unit, tambah unit, registrasi, peminjaman/pengembalian, checkout dan pengajuan/keputusan penonaktifan. Konfirmasi pendek tetap mengikuti isi.

Foto detail memakai object-contain dan pratinjau besar4:3; thumbnail160×120px. Foto barang di atas fakta/deskripsi hanya berasal dari STOCK_UNIT_CREATED, tanpa fallback ke foto pinjam/kembali. Foto initial tidak diulang pada aktivitas registrasi; foto pinjam/kembali tampil pada aktivitas terkait tepat di atas link Detail pinjaman dan tetap tersedia di menu Tamu. Lampiran laporan kondisi/verifikasi tetap pada aktivitas unit terkait. Data foto tersimpan tidak diubah. Tombol Buka kunjungan tamu pada konflik registrasi membuka ID dari respons server; tidak menyediakan textarea alasan atau tombol lanjut duplikat. Nama aksi operasional yang direncanakan: Perbarui kondisi; tidak menambah tombol tanpa endpoint yang sesuai.

Riwayat unit memakai timeline vertikal dengan garis tipis dan titik aktivitas di dalam panel yang default tertutup. Setiap kali panel dibuka kembali ke halaman1; aktivitas terbaru otomatis terbuka dan aktivitas lain bisa dibuka bersamaan. Penyerahan unit tampil sebagai Dari → Ke: titik asal kosong, tujuan solid navy, dihubungkan garis putus-putus. Node Tamu memuat snapshot nama/kamar. Ini alur historis; header menampilkan Status saat ini: Dipinjam untuk custody GUEST, serta label sesuai state canonical lain. Lokasi menjadi fakta tersendiri, bukan digabung menjadi Tamu · Bersama tamu. Perubahan rincian memakai Semula/Menjadi dan Data awal unit/Rincian pembaruan. Link Detail pinjaman sementara membuka bagian riwayat kunjungan dengan status ALL; halaman khusus satu transaksi/unit masih pekerjaan BE berikutnya.

Header inventaris lebih padat: judul20px/22px, keterangan12px satu baris, padding halaman16px/24px dan gap16px. Tombol toolbar/search/toggle desktop36px, mobile tetap44px. X Hapus pencarian berada tepat di kanan Cari hanya sesudah q diterapkan; kembali ke /inventory tanpa query/page/selection. Perubahan ukuran ini khusus toolbar katalog, tidak mengecilkan tombol form/dialog.
