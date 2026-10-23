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
- Disclosure nama panjang memakai Selengkapnya di kanan, berubah Ringkas saat terbuka, dengan teks lengkap yang membungkus aman. Tidak memakai label Nama lengkap barang atau kata More berbahasa Inggris.
- Unit table selalu dirender dengan header, termasuk saat kosong; empty-state berada pada baris colspan2 di tbody. Pertahankan kode, serial opsional (— bila kosong), deskripsi unit dari notes, custody, kondisi terkini, kesiapan, loss, lokasi, lifecycle serta cursor existing. Jangan menggabungkan dimensi status.
- Close, Escape dan backdrop bekerja sesuai mode; pertahankan normalized search/page saat melepas selection. Kembalikan fokus ke trigger yang masih terpasang. Native modal menangani fokus dan body lock.
- Panel dapat menampilkan foto katalog dan deskripsi jenis yang disimpan. Selected-unit inspector/riwayat interaktif belum diimplementasikan. UI create jenis dan Add Stock tersedia sesuai bagian 10; mutation lain tetap pekerjaan terpisah.

## 8. Motion dan feedback

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

- Tombol primary memakai primary/white, hover primary-hover; secondary memakai inset/strong. Focus workspace outline 2px primary, offset 2px; permukaan gelap memakai accent. Jangan memakai hover sebagai satu-satunya petunjuk interaksi.
- Cursor pointer untuk tombol aktif, role=button, select, summary dan input aksi. Tombol/select nonaktif memakai not-allowed; utility pending cursor-wait tetap mengungguli aturan base. Link href tetap cursor pointer native. Jangan mengubah input teks menjadi cursor tangan atau membuat seluruh baris noninteraktif terlihat clickable.
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

Satu StockRegistrationProvider mengelola dialog bersama sehingga klik dari kartu/tabel/panel memakai alur yang sama. Native modal flat putih maksimum576px dengan gutter16px, padding24/32px, radius8px, backdrop35%. Jumlah1–100 wajib; helper tepat 1-100 unit per penambahan. Field angka mempertahankan type=number/min/max/step tanpa spinner native. Lokasi awal * dipilih sekali untuk seluruh batch dari lokasi aktif database, tanpa pilihan default; daftar kosong memblokir simpan dengan pesan. Setiap unit memakai accordion native berlabel Unit N dengan aksi Buka/Tutup, maksimal satu terbuka. Unit pertama terbuka pada form baru; perubahan jumlah menutup semuanya. Isian unit yang masih ada tetap tersimpan saat ditutup atau jumlah ditambah, sedangkan unit yang dihapus karena jumlah dikurangi ikut dibuang. Isi accordion: Kondisi unit * (default Baik), Nomor seri (opsional), Deskripsi (opsional). Tidak ada kondisi global/override berulang. Deskripsi textarea memiliki resize-none, termasuk deskripsi jenis barang. Kondisi registrasi dicatat di audit; tabel membaca kondisi terkini dari API. Serial tetap opsional untuk barang tanpa nomor seri. Deskripsi dipetakan ke notes. Kode/kesiapan tetap server-derived, termasuk inspeksi bagi non-GOOD. initialLocationId dikirim sekali pada batch; server memvalidasi lokasi aktif dan menetapkannya ke setiap unit dengan custody HOUSEKEEPING. Caller lama tanpa initialLocationId tetap memakai HK_MAIN_STORAGE.

POST /api/stock-batches mempertahankan requestId UUID dan payload yang sama jika respons belum pasti; semua kontrol input dibekukan saat retry, dan klik + mana pun membuka kembali batch yang belum pasti. Pending mencegah Escape/batal/double-submit. Respons200 replay dan201 divalidasi terhadap id/itemId/jumlah batch, lalu menampilkan N unit berhasil ditambahkan., Selesai, dan refresh data nyata. Penolakan definitif400/401/403/404/ITEM_INACTIVE/STORAGE_UNAVAILABLE/LOCATION_UNAVAILABLE memungkinkan perbaikan; REQUEST_CONFLICT tetap meminta pemeriksaan, bukan membuat ID baru otomatis.

Recovery saat ini page-local, belum lintas reload/tab: pesan meminta tidak meninggalkan halaman dan beforeunload memperingatkan selama hasil belum pasti. Jangan menyebutnya recovery persisten. Scope berikutnya dapat menyimpan pending batch per akun bila diperlukan. Escape form tidak boleh menutup panel unit di belakangnya.

### Edit jenis barang

Aksi Edit dengan ikon pensil berada di kanan Tambah stok dalam satu baris setelah count unit pada panel detail jenis. Tampil hanya untuk inventory:item:update (Staff/Supervisor), termasuk jenis nonaktif sesuai backend. Aksi sekunder berbentuk button surface putih dengan border control, teks strong14px/500 dan ikon ph:pencil-simple20px; target minimal44px dan gap ikon8px. Tambah stok tetap primary emas, mengisi sisa lebar baris dengan gap8px. Jika jenis nonaktif, hanya Edit ditampilkan. Baris harus tetap muat mulai320px.

Dialog native maksimum448px, gutter16px, padding24/32px, radius8px, flat putih dan backdrop35%. Form bernama Edit, memakai EditItemDialog di edit-item-dialog.tsx. Field Nama jenis barang * required/max100 dan Deskripsi (opsional) max2000/rows3/resize-none, keduanya terisi dari jenis terpilih. FE mengirim name+description, menormalisasi trim/nama dan memvalidasi respons id/name/description; string deskripsi kosong mengharapkan null. Tombol Batal/Simpan, success Jenis barang berhasil diperbarui., Selesai dan refresh. Pending mengunci field/submit/batal/Escape; duplicate menandai nama, session expired memberi link login, unknown-result meminta muat ulang detail. Foto/status/unit tidak ikut diedit. CATATAN23Oktober2026: ini persiapan FE, backend masih name-only sehingga deskripsi belum bisa disimpan nyata. Owner akan menerapkan schema/service/API beserta regresi dari output/backend-edit-item-guide.md; jangan mengklaim fitur end-to-end selesai sebelum verifikasi BE.

Dialog dirender lewat portal agar tidak terpotong panel. Event click, Escape dan cancel tidak boleh menutup panel detail di belakang; tutup mengembalikan focus dan overflow sebelumnya. Verifikasi FE terbaru:93unit tests, lint/typecheck dan14browser assertions passed pada320/390/1366px; screenshot ditinjau. Respons simpan browser diintersepsi hanya untuk test, bukan bukti persistence BE.

## 11. Dashboard dan scope bisnis

Statistik peminjaman/okupansi contoh diizinkan pemilik hanya dengan label Data demonstrasi dan penjelasan belum terhubung ke data hotel. Jangan membuat aktivitas tamu, notifikasi, stok tersedia atau kontrol operasional palsu. Dashboard masih memiliki temuan audit duplikasi breakdown dan metadata tab starter; belum ada persetujuan perubahan itu dalam slice ini.

Aplikasi independen tanpa PMS sync. Nama tamu, nomor kamar dan nomor booking dimasukkan manual sesuai PROJECT; form/backend yang belum dibuat bukan masalah styling. Barcode, distribusi pantry dan kategori tidak termasuk implementasi ini. Ekspor report adalah pekerjaan berikutnya. Create jenis dengan foto/deskripsi dan Add Stock frontend kini tersedia. Ubah nama jenis existing tersedia lewat PATCH yang sudah diaudit. Edit foto/deskripsi jenis existing, koreksi unit, deactivation review dan selected-unit history frontend masih menjadi slice terpisah.

## 12. Panduan penerimaan dan implementasi berikutnya

1. Baca dokumen ini, PROJECT yang relevan, CONTEXT dan source aktual sebelum mengubah UI. Preserve dirty work dan fungsi di luar screenshot.
2. Gunakan Tailwind/token existing; jangan kembali ke palet crimson/brass atau memasang glass ke semua kartu. Figma menjadi acuan visual bersama override pemilik di atas.
3. Periksa 320/390px, tablet 768px, desktop 1280/1366px, dan mode panel 1440px. Uji sidebar ciut, nama panjang, loading/empty/error/pending, keyboard dan reduced motion. Lebar kartu tidak berubah hanya karena sidebar berubah.
4. Jalankan lint/typecheck serta test yang relevan. Browser screenshot harus ditinjau; bandingkan computed typography/geometry untuk keluhan visual spesifik. Jangan mengklaim build/integration/logout passed jika tidak dijalankan.
5. Catat hasil aktual di DEVLOG dan refresh CONTEXT; perubahan spesifikasi aktif masuk dokumen ini, bukan sekadar menambah catatan override yang saling bertentangan.
6. Tidak mengubah backend/auth/schema/permission atau menambah data palsu demi fidelity. Jangan switch branch, commit atau mengakses aset eksternal tanpa otorisasi yang sesuai.

Referensi render lokal (bukti review, bukan aset produksi): `../output/playwright/catalog-centered-1366.png`, `login-without-reveal.png`, `refinement-mobile-menu.png`, `refinement-panel-1440.png`. Screenshot memakai data uji lokal dan mungkin belum menunjukkan revisi tombol paling baru. Preview generatif `../design-previews/inventory-crimson-contextual-v2.png` hanya sejarah komposisi, bukan arah warna aktif.
