# Housekeeping Design System

ARCHIVE ONLY: superseded by ../DESIGN_SYSTEM.md on 2026-10-22. This copy preserves earlier decisions and conflicting historical overrides; do not implement from it.

Status: arah visual disetujui pemilik pada 21 Oktober 2026. Pada 22 Oktober 2026, shell/login dan inventory read mulai diimplementasikan. Foto barang, panel detail unit/riwayat, dan UI mutasi inventory masih belum diimplementasikan; status ini bukan penerimaan visual seluruh mockup.

Keputusan lanjutan 22 Oktober 2026: pemilik menolak alternatif glassmorphism dan meminta frontend dilanjutkan dengan flat crimson. Lihat unit menjadi tombol secondary persegi panjang dengan radius 6px. Gunakan fondasi yang sama untuk menu lain saat dikembangkan; keputusan ini tidak menambah fitur bisnis.

Pengecualian login, dikonfirmasi setelah keputusan tersebut: panel form login memakai smoked glass (transparansi dan backdrop blur), dengan fallback permukaan hampir solid. Workspace tetap flat. Deskripsi kiri login memakai `#CBC8C3`, lebih terang dari teks dasar namun di bawah judul `#E8E6E3`; keterbacaan di atas foto harus dicek pada hasil render.

Keputusan terbaru 22 Oktober 2026: pemilik menyatakan login sudah cocok dan meminta item navigasi aktif memakai glass senada form, tanpa garis merah kiri. Referensi source login: panel `surface` opacity 40%, blur md, border putih 10%; input background opacity 25%, blur sm, border putih 20%. Terapkan ke item navigasi aktif secara terukur, dengan fallback solid; bukan glass untuk seluruh workspace. Batas ini menggantikan aturan navigasi aktif di bawah.

Dokumen ini menjadi sumber kebenaran desain UI/UX untuk pekerjaan berikutnya. `PROJECT.md` tetap mengatur kebutuhan bisnis, izin, dan invariant domain. Perubahan tampilan tidak boleh mengubah aturan tersebut.

## 1. Persetujuan dan lingkup

Pemilik menyetujui [mockup inventory versi kedua](../design-previews/inventory-crimson-contextual-v2.png), dengan tambahan foto barang di sebelah nama dalam tabel jenis barang dan di header panel detail kanan. Foto merupakan penambahan yang disetujui lewat percakapan; mockup tersebut belum menggambarkannya.

Enam warna dasar pada bagian 3 diberikan langsung oleh pemilik. Ukuran, token pendukung, perilaku komponen, dan breakpoint dalam dokumen ini merupakan spesifikasi penerjemahan desain tersebut untuk implementasi yang konsisten; bukan klaim bahwa setiap angka telah diperiksa pemilik secara terpisah.

Dokumen ini menggantikan arahan visual inventory yang bertentangan dalam `docs/INVENTORY-DESIGN.md`, snapshot konteks, serta alternatif preview terdahulu. Jangan mengambil palet brass, sage, atau olive dari alternatif yang tidak dipilih. Riwayat dokumen lama tetap dipertahankan.

Pembuatan dokumen tidak mengizinkan implementasi tanpa tugas terpisah. Pemilik meminta frontend dilanjutkan pada 22 Oktober 2026, lalu secara eksplisit meminta warna login diselaraskan. Guidance login menggunakan token crimson/dark, panel solid, foto hotel yang ada, dan mobile form-only; alur autentikasi tetap dipertahankan. Pemilik mengetik kode dan menjalankan pemeriksaan.

## 2. Filosofi dan arah visual

Modern Hospitality Operations: antarmuka dark hangat, padat informasi, dengan aksen crimson yang terbatas. Staff harus dapat menemukan jenis barang, memilih unit fisik, dan membaca kondisi serta riwayatnya tanpa kehilangan konteks.

- Hierarki dibentuk oleh ukuran teks, alignment, jarak, dan perubahan tingkat terang permukaan.
- Ruang layar diisi informasi operasional yang relevan. Jangan menambahkan statistik atau dekorasi untuk mengisi ruang kosong.
- Jenis barang dan unit fisik selalu dibedakan melalui judul, kode unit, serta lokasi tindakan.
- Gunakan Bahasa Indonesia untuk seluruh label, pesan, dan nama status yang ditampilkan. Simpan enum teknis di lapisan data.
- Mode desain: Operate. Energi rendah, ritme terstruktur, gerakan minimal.

## 3. Token warna

Gunakan nilai flat berikut sebagai acuan, bukan warna hasil sampling gambar generatif yang bisa mengandung variasi pencahayaan.

| Token | HEX | Pemakaian |
| --- | --- | --- |
| `background` | `#171615` | Latar halaman |
| `sidebar` | `#181614` | Navigasi utama |
| `surface` | `#1D1A19` | Tabel, input, bidang informasi |
| `surface-elevated` | `#2C2624` | Baris terpilih, hover, panel di atas bidang dasar |
| `primary` | `#911414` | Aksi utama dan indikator pilihan |
| `foreground` | `#ABA9A6` | Teks isi, label, metadata |
| `foreground-strong` | `#E8E6E3` | Judul, nama barang, nilai penting, link |
| `on-primary` | `#FFFFFF` | Teks dan ikon pada tombol primary |
| `primary-hover` | `#A21B1B` | Hover tombol primary |
| `primary-pressed` | `#781010` | Tombol primary sedang ditekan |
| `nav-active` | `#391C1B` | Latar item navigasi aktif |
| `divider` | `#403835` | Pemisah dekoratif tabel dan bagian |
| `control-border` | `#78716D` | Batas kontrol jika bentuk kontrol perlu terlihat |
| `focus-ring` | `#D7B9B2` | Fokus keyboard yang kontras |
| `disabled-text` | `#827B77` | Label kontrol yang benar-benar nonaktif |

`divider` bukan pengganti batas input atau indikator fokus. Crimson tidak digunakan untuk teks link kecil di atas background. Link memakai `foreground-strong`, underline pada hover/fokus, dan konteks tindakan yang jelas.

### Warna semantik

| Makna | Teks/ikon | Latar opsional | Contoh |
| --- | --- | --- | --- |
| Berhasil / kesiapan positif | `#89B391` | `#223027` | Simpan berhasil, Siap |
| Perlu perhatian | `#CEAE78` | `#342B20` | Menunggu inspeksi |
| Error / tindakan destruktif | `#F09B94` | `#3C2221` | Gagal menyimpan, konfirmasi tindakan destruktif |
| Netral / nonaktif | `#ABA9A6` | `#2C2624` | Nonaktif, informasi umum |

Setiap status memiliki teks; warna bukan satu-satunya pembeda. Dot berukuran 6px boleh mendampingi teks. Dipinjam merupakan status operasional normal, bukan error. Lifecycle Aktif tidak berarti unit siap dipinjam. Kondisi, kesiapan, custody, lifecycle, dan kewajiban peminjaman tidak boleh dilebur menjadi satu badge.

## 4. Tipografi

Gunakan Geist Sans yang sudah tersedia pada project. Fallback: Arial, Helvetica, sans-serif. Hindari font baru tanpa kebutuhan yang jelas. Geist Mono hanya untuk kode unit atau serial jika membantu pembacaan; jangan digunakan pada seluruh tabel.

| Peran | Ukuran / line-height | Weight |
| --- | --- | --- |
| Wordmark | 20 / 28px | 600 |
| Judul halaman desktop | 28 / 36px | 600 |
| Judul halaman mobile | 24 / 32px | 600 |
| Nama barang di panel | 22 / 30px | 600 |
| Judul bagian | 18 / 26px | 600 |
| Nama barang / nilai tabel | 14 / 20px | 500 |
| Isi dan kontrol | 14 / 20px | 400; tombol 500 |
| Metadata / header tabel | 13 / 18px | 400; header 500 |
| Bantuan singkat | 12 / 18px | 400 |

Body dan label kontrol tidak lebih kecil dari 14px pada mobile. Gunakan sentence case, bukan label huruf besar dengan tracking lebar. Angka, tanggal, dan kode memakai tabular numerals. Nama barang boleh membungkus; jangan memotong nilai penting tanpa cara membaca teks lengkap.

## 5. Spacing, ukuran, dan permukaan

- Skala jarak: 4, 8, 12, 16, 24, 32px. Gunakan 8px antara ikon dan label, 12px antara thumbnail dan nama, 16px padding panel, 24px antarbagian utama.
- Radius: 4px badge, 6px kontrol/thumbnail, 8px tabel/dialog. Jangan menjadikan semua kontrol berbentuk pill.
- Tombol/input desktop tinggi 40px; target sentuh mobile minimal 44 × 44px. Ikon 18px pada kontrol, 20px pada navigasi.
- Border 1px. Pemisah horizontal cukup untuk tabel utama; hindari grid tebal di setiap sel.
- Bidang data memakai warna flat. Tidak ada gradient, glow, grain, glass, atau shadow pada setiap kartu.
- Hanya overlay yang memakai shadow: `0 12px 32px #00000040`. Scrim dialog/drawer: `#00000080`.

## 6. Application shell dan navigasi

- Pada desktop lebar, sidebar 224px dan header 56px. Sidebar memakai wordmark Housekeeping serta subtitle Operasional hotel. Logo baru tidak menjadi persetujuan terpisah dari mockup; simbol kubus di gambar adalah penanda inventory, bukan logo brand wajib.
- Navigasi menggunakan baris minimal 44px, padding horizontal 12px, gap 8px. Aktif: latar `surface-elevated` opacity 40% dengan backdrop blur md (fallback opacity 95%), border putih 10% di semua sisi, radius 8px, teks `foreground-strong`, weight 600; tanpa garis merah kiri. Fokus keyboard tetap ring `focus-ring`. Pada sidebar solid, blur akan halus karena tidak ada foto di belakangnya.
- Bagian Ruang kerja menampung tujuan yang tersedia sesuai role. Pengelompokan Dalam inventaris dapat memuat Jenis barang dan Pengajuan penonaktifan setelah permukaan terkait tersedia.
- Jangan membuat link mati, menampilkan tombol tanpa perilaku, atau menganggap API yang tersedia sama dengan halaman yang sudah diimplementasikan. Navigasi mengikuti izin yang ada.
- Akun staf dan Keluar berada di bawah sidebar desktop. Tampilkan nama nyata hanya dari sesi yang sah. Tidak ada avatar rekaan atau dropdown akun tanpa fungsi.
- Header memakai breadcrumb singkat; hanya leluhur dengan tujuan valid yang menjadi link. Tidak ada pencarian global, notifikasi, jam, atau tanggal dekoratif.
- Inspect konvensi ikon project sebelum implementasi. Gunakan Better Icons untuk memilih satu keluarga outline, ukuran/stroke seragam. Jangan menambah dependency hanya untuk beberapa ikon. Ikon selalu memiliki alasan fungsi dan nama aksesibel bila berdiri sendiri.

## 7. Komposisi inventory yang disetujui

Alur utama: pilih jenis barang, lihat unit fisik di bawahnya, pilih unit, baca detail dan riwayat di kanan.

1. Judul Inventaris dan deskripsi singkat Jenis barang dan unit fisik. Aksi Tambah jenis barang terpisah dari Tambah stok.
2. Jumlah hasil jenis barang dan pencarian nama berada pada satu toolbar desktop. Jumlah harus berasal dari query, bukan dari contoh gambar.
3. Tabel jenis barang: Nama barang, Status, Diperbarui, Aksi. Thumbnail menyatu dengan sel nama. Lihat unit memakai tombol secondary tinggi 36px desktop (44px mobile), radius 6px, padding horizontal 12px, label terang, border `control-border`, hover `surface-elevated`. Tombol per baris ini secara eksplisit diminta pemilik pada 22 Oktober 2026.
4. Pagination jenis barang langsung di bawah tabel, sebelum bagian unit. Pilihan jenis barang di halaman lain tidak boleh menghasilkan panel yang tampak terkait dengan baris yang berbeda.
5. Bagian Unit [nama barang] berisi jumlah unit terdaftar dan tabel Kode unit, Kondisi, Kesiapan, Lokasi. Baris terpilih memakai `surface-elevated` dan indikator kiri 3px; pilihan dapat dioperasikan keyboard.
6. Panel kanan dimulai dengan foto dan nama jenis barang, status, Tambah stok, dan Ubah nama. Berikutnya Detail unit dengan kode unit, nomor seri, lokasi, kondisi, kesiapan, lifecycle, catatan, dan Riwayat [kode unit].

Panel barang dapat terbuka sebelum unit dipilih. Saat itu tampilkan ajakan Pilih unit untuk melihat detail, tanpa memasang detail unit pertama secara diam-diam. Memilih jenis barang lain membersihkan pilihan unit lama. Menutup panel mengembalikan fokus ke pemicunya.

Total terdaftar bukan total siap dipinjam. Label Siap menerjemahkan readiness saja; jangan menggunakannya sebagai kesimpulan borrowability yang mengabaikan state lain. Riwayat dalam panel adalah riwayat unit terpilih, bukan feed gabungan jenis barang.

## 8. Foto barang: tambahan yang disetujui

- Foto mewakili jenis barang. Gunakan foto yang sama pada baris jenis barang dan header panel barang; jangan menyajikannya sebagai bukti kondisi unit fisik tertentu.
- Thumbnail tabel: 44 × 44px, radius 6px, gap 12px sebelum nama; tinggi baris minimal 64px setelah foto ditambahkan.
- Foto panel: 72 × 72px di samping nama/status, radius 8px. Pada mobile gunakan 56 × 56px. Nama tetap boleh membungkus.
- Gunakan `object-fit: contain`, padding 4px, latar `surface-elevated`, rasio 1:1. Jangan meregangkan gambar atau memotong bagian penting produk.
- Jika foto belum ada atau gagal dimuat, pertahankan ukuran slot dengan ikon barang netral dan label aksesibel Foto belum tersedia. Jangan mengisi dengan foto stok yang seolah foto barang hotel.
- Foto yang hanya mengulang identitas nama di sebelahnya memakai alt kosong. Jika foto menyampaikan pembeda yang relevan, alt mendeskripsikan pembeda itu secara singkat. Foto bukan tombol zoom tanpa fungsi yang disetujui.
- Tetapkan ukuran intrinsik agar layout tidak bergeser; thumbnail di luar viewport dimuat secara lazy. Jangan mengirim foto resolusi asli untuk slot kecil.
- Model `Item` yang diperiksa belum memiliki field foto. Storage, upload, validasi file, izin pengelolaan, dan API foto memerlukan pekerjaan terpisah. Persetujuan visual ini tidak memilih layanan penyimpanan atau mengizinkan migrasi.

## 9. Tabel, pencarian, dan pagination

- Header tabel tinggi 40px; baris unit minimal 48px; baris jenis barang dengan foto minimal 64px. Padding sel 12px vertikal dan 16px horizontal, disesuaikan agar tinggi minimum terjaga.
- Nama dan metadata rata kiri. Angka agregat rata kanan; tanggal memakai format Indonesia konsisten. Kode unit menggunakan format backend seperti HK-000125.
- Hover baris memakai `surface-elevated`; selected juga memiliki indikator bentuk. Hover tidak menghapus indikator pilihan. Jangan membuat klik baris mengganggu link/button di dalamnya.
- Pencarian nama memiliki label aksesibel, tinggi 40px, ikon magnifier 18px, lebar desktop 320–480px dan maksimum 100% ruang tersedia. Placeholder Cari nama barang bukan satu-satunya label.
- Jangan menambahkan filter/sort yang belum didukung atau glyph sorting tanpa interaksi. Search mempertahankan query ketika membuka detail; perubahan query kembali ke halaman pertama.
- Item list menggunakan pagination halaman yang didukung backend. Sebelumnya/Berikutnya disabled ketika tidak ada halaman tujuan; tampilkan rentang dan total yang benar.
- Daftar unit memakai cursor backend. Gunakan Muat unit berikutnya bila masih ada cursor, bukan angka halaman rekaan. Saat semua data termuat, tampilkan jumlah unit ditampilkan.
- Loading tambahan mempertahankan baris lama dan pilihan yang masih valid; kegagalan tidak boleh mengganti data dengan angka nol palsu.

## 10. Komponen

| Komponen | Spesifikasi |
| --- | --- |
| Primary button | `primary`, teks `on-primary`, 40px tinggi, padding 16px horizontal, radius 6px; satu aksi dominan per konteks |
| Secondary button | `surface`, teks `foreground-strong`, border `control-border`; untuk Tambah jenis barang atau Ubah nama sesuai konteks |
| Text action | Teks terang, tanpa border, underline hover/fokus; area sentuh tetap memadai |
| Icon button | 40 × 40px desktop, 44 × 44px touch; nama aksesibel; jangan bergantung pada tooltip |
| Input/select | `surface`, border `control-border`, teks terang, label tetap terlihat, padding 12px; menu hanya berisi opsi yang didukung |
| Textarea | Gaya input, tinggi awal 96px, dapat bertambah untuk catatan |
| Badge | Teks 12/18px, padding 2px 6px, radius 4px; status sederhana cukup dot + teks |
| Card | Hanya bila mengelompokkan isi berbeda, padding 16px; jangan membungkus ulang setiap bagian panel |
| Dropdown | Lebar minimal 180px, padding 4px, opsi minimal 40px tinggi; keyboard, Escape, dan return focus |
| Tabs | Hanya untuk isi setara yang benar-benar ada; tinggi 44px, active memakai teks terang dan underline 2px; arrow-key navigation |
| Dialog | Lebar maksimum 480px untuk konfirmasi, 640px untuk form; viewport gutter 16px, padding 24px; body dapat scroll |
| Notification | Pesan singkat spesifik, teks + ikon semantik; error yang butuh tindakan tetap terlihat sampai ditangani |

Form memakai label di atas input, jarak label 8px dan antarfield 16px. Error ditempatkan di dekat field dan dikaitkan secara aksesibel. Jangan menghapus input pengguna ketika server gagal. Tombol destruktif menyebut tindakan konkret, bukan sekadar Ya.

## 11. State dan interaksi

- Focus-visible: ring `focus-ring` 2px dengan offset 2px. Fokus tidak hanya ditandai crimson yang kontrasnya rendah di background.
- Hover primary memakai `primary-hover`; pressed memakai `primary-pressed`. Secondary hover memakai `surface-elevated`. Jangan menggeser ukuran atau posisi elemen saat hover.
- Disabled: latar `surface-elevated`, teks `disabled-text`, tidak dapat diaktifkan. Jangan sekadar mengurangi opacity seluruh area berisi informasi penting.
- Pending mutation: label spesifik Menyimpan… atau Menambahkan stok…, cegah submit ganda, tetap tampilkan konteks. Jangan mengunci seluruh halaman untuk query panel saja.
- Loading awal: skeleton sesuai struktur baris/foto, bukan spinner memenuhi halaman. Hormati reduced motion; gunakan skeleton statis bila diminta.
- Empty data: Belum ada jenis barang dengan aksi tambah untuk role yang berhak. Search kosong: Barang tidak ditemukan, tampilkan query dan aksi Hapus pencarian.
- Error query: Data belum berhasil dimuat dengan Coba lagi. Jika ada data lama, pertahankan dan jelaskan bahwa pembaruan gagal. Jangan menampilkan sukses sebelum server berhasil.
- Transisi warna/opacity 120–160ms; drawer 180ms. Tidak ada animasi dekoratif, bounce, auto-scroll, atau gerakan berulang.
- Memilih unit memperbarui panel tanpa memindahkan fokus secara mengejutkan. Drawer modal memindahkan fokus ke dalam, menahan fokus di dalam, lalu mengembalikannya ketika ditutup.

## 12. Responsivitas

| Lebar viewport | Perilaku |
| --- | --- |
| ≥1440px | Sidebar 224px; panel kanan 352px ketika dibuka; main fleksibel dengan gutter 24px dan lebar kerja minimal 720px |
| 1024–1439px | Sidebar 200px; main gutter 24px; detail menjadi drawer maksimal 400px agar tabel tidak terjepit |
| 768–1023px | Sidebar menjadi navigation drawer, header tetap 56px; main gutter 24px; detail overlay maksimal 400px |
| <768px | Main gutter 16px; navigasi drawer, search selebar kontainer; detail tampil penuh dengan Kembali; tombol sentuh minimal 44px |

Pada layar kecil, daftar jenis barang berubah menjadi baris berlabel: thumbnail + nama, status, metadata, dan Lihat unit. Pertahankan data serta kemampuan yang sama tanpa mengecilkan font. Daftar unit memakai label eksplisit untuk kondisi/kesiapan/lokasi. Hindari scroll horizontal halaman; tabel kompleks yang memang membutuhkannya boleh memakai region scroll tersendiri berlabel.

Nama panjang, zoom 200%, foto gagal, pesan validasi, dan tombol dengan label panjang harus tetap muat. Pada desktop sangat lebar, gunakan main content maksimum 1440px, rata kiri; jangan memperbesar teks atau jarak sel untuk mengisi ruang.

## 13. Aksesibilitas

- Target WCAG 2.2 AA: teks normal minimal 4,5:1; teks besar dan batas/indikator kontrol yang diperlukan minimal 3:1 terhadap warna yang bersebelahan.
- Hitungan token: `foreground` pada `surface-elevated` 6,35:1; `foreground-strong` pada `surface` 13,89:1; putih pada `primary` 9,07:1; `control-border` pada `surface-elevated` 3,11:1. Ini pemeriksaan pasangan warna, bukan audit UI lengkap.
- Teks sukses/perhatian/error pada `surface-elevated` masing-masing 6,33:1 / 7,06:1 / 6,97:1. Uji ulang pasangan warna lain dan state hover saat implementasi.
- Gunakan landmark, satu h1, heading bertingkat, tabel semantik dengan header, label form, dan nama aksesibel untuk tombol ikon.
- Semua tindakan dapat dilakukan keyboard. Sediakan skip link ke konten utama, fokus terlihat, serta status pilihan yang dapat dibaca assistive technology.
- Dialog/drawer memiliki nama, close yang jelas, Escape, focus trap bila modal, dan pemulihan fokus. Jangan memakai focus trap untuk panel desktop nonmodal.
- Umumkan hasil simpan dan error melalui live region yang sesuai. Jangan mengumumkan ulang seluruh tabel setiap pilihan berubah.
- Ikon, warna, foto, hover, atau tooltip tidak menjadi satu-satunya sumber informasi.

## 14. Batas fitur dan pola yang dilarang

- Jangan menyalin statistik, notifikasi, foto, kategori, nama orang, atau jumlah peminjaman dari gambar referensi sebagai data produksi.
- Hindari navy/blue/teal dominan, aksen neon, serif dekoratif, gold/brass lama, gradient, glow, glassmorphism, shadow besar, dan deretan kartu statistik yang tidak membantu tugas.
- Jangan menambahkan laporan, settings, global search, atau navigasi modul baru untuk membuat sidebar terlihat penuh.
- Hindari dua tombol Tambah stok tanpa konteks barang dan status yang diulang berkali-kali. Tombol Lihat unit per baris adalah pengecualian yang disetujui; jangan memperluasnya menjadi deretan tombol untuk semua kemungkinan aksi.
- Jangan mencampur keluarga ikon, radius, atau bahasa visual antarhalaman. Implementasi mendatang memakai Tailwind sesuai keputusan pemilik; dokumen ini tidak mengizinkan migrasi stylesheet sekarang.
- Jangan memuat screenshot mockup sebagai UI produksi. Teks, kontrol, tabel, serta state harus menjadi komponen semantik saat implementasi diminta.

## 15. Referensi dan pengecualian eksplisit

- Acuan komposisi disetujui: [inventory-crimson-contextual-v2.png](../design-previews/inventory-crimson-contextual-v2.png).
- Tambahan disetujui setelah gambar: foto jenis barang di sel nama dan header panel kanan; aturan ukuran/fallback ada di bagian 8.
- Foto item boleh memiliki latar terang bawaan sebagai isi gambar. Ini tidak mengizinkan panel aplikasi putih/cream.
- Contoh HK-000125, nomor seri, tanggal, catatan, jumlah unit, dan isi riwayat pada mockup adalah data sintetis. Jangan menjadikannya fixture produksi atau bukti data hotel.
- Presisi warna, tipografi, ukuran dan perilaku mengikuti dokumen ini ketika rendering generatif berbeda. Contohnya, warna primary harus flat `#911414`, bukan kilau merah yang mungkin terlihat pada gambar.
- Login diizinkan untuk diselaraskan warnanya melalui permintaan terpisah pemilik pada 22 Oktober 2026. Pertahankan foto hotel, form-only mobile, field login, dan perilaku autentikasi. Jangan menambahkan fitur recovery atau kebijakan sesi baru melalui restyling.

## 16. Kriteria penerimaan implementasi mendatang

- [ ] Komposisi jenis barang → unit → detail/riwayat sesuai mockup dan pemilihan konteks tidak tertukar.
- [ ] Foto tampil di dua lokasi yang disetujui, dengan fallback stabil dan tanpa menganggapnya bukti kondisi unit.
- [ ] Enam token dasar dipertahankan; token state, semantik, dan typography konsisten.
- [ ] Semua teks UI berbahasa Indonesia, tidak ada data contoh pada produksi, dan angka berasal dari sumber yang benar.
- [ ] Permission server tetap menjadi otoritas; aksi/navigasi yang ditampilkan sesuai akses pengguna.
- [ ] Search, pagination, selected state, empty, loading, error, validasi, dan sukses memiliki perilaku nyata.
- [ ] Desktop 1440px, laptop 1280px, tablet 768px, mobile 390px dan 320px diperiksa; tidak ada overflow halaman atau fokus tersembunyi.
- [ ] Keyboard, zoom, reduced motion, screen reader labels, serta kontras semua state diperiksa pada UI yang dirender.
- [ ] Tidak ada pergeseran layout akibat foto, border hover, atau feedback simpan.
- [ ] Implementasi diuji hanya setelah ada instruksi implementasi terpisah; kelulusan tidak dapat disimpulkan dari mockup ini.

## 17. Arahan untuk sesi berikutnya

Mulai pekerjaan UI dengan membaca dokumen ini, `PROJECT.md`, dan kode aktual. Jangan melanjutkan dari alternatif palette/comp lama yang belum dipilih. Jika implementasi memerlukan data atau fitur baru, pisahkan keputusan itu dari keputusan visual.

Rekomendasi tambahan untuk `AGENTS.md`, hanya bila pemilik mengizinkan pengeditannya: “Sebelum pekerjaan UI/UX, baca docs/DESIGN_SYSTEM.md sebagai sumber kebenaran desain yang disetujui; PROJECT.md tetap mengatur kebutuhan bisnis. Implementasi memerlukan instruksi terpisah.”

Dokumentasi Phase 3 selesai ketika file ini tersedia. Tidak ada implementasi UI, upload foto, perubahan skema, atau pengujian aplikasi dalam langkah ini.

## 2026-10-22 — Figma workspace override (owner-approved)

This section supersedes conflicting workspace rules above. The owner approved Phase 2 after read-only analysis of Figma file `1zcG8yCxhIVZlx50938se0`. The earlier crimson/dark design remains the accepted **login** appearance; do not restyle login during this workspace task.

- Visual references: inventory `1:1161`, dashboard `1:2`, header `1:1734`, sidebar `1:1758`, catalog card `1:1329`. Figma remains the visual source of truth; preserve business functionality where a visual prototype omits it.
- Workspace tokens in `src/app/globals.css`: background `#F8F9FF`, sidebar `#131B2E`, white surface, inset `#EFF4FF`, primary ink `#0B1C30`, secondary ink `#45464D`, sidebar text `#BEC6E0`, amber action `#904D00`, orange accent `#FE932C`. Controls use `#76777D`; separators `#E3E7EF`. Status text uses green `#216247`, amber `#904D00`, red `#BA1A1A`, with labels as well as color.
- Inter is the workspace body and heading font under the latest owner typography revision. Page title 28/36px desktop, 24/36px mobile, weight 600, normal tracking. Card titles 15/20px, weight 500, normal tracking. Body 14/20px; metadata 12/16px; short section labels may use 11px. Scope fonts to the workspace so login remains unchanged.
- Desktop sidebar 288px; header 64px; main padding 32px. Main max width 1440px. Sidebar folds into a native disclosure below 1024px; padding becomes 24px tablet and 16px mobile. Cards use 8px corners, 16px gaps and 16px body padding; photo slots are 176px high. Three columns from 1280px, two from 640px, one below that. Touch targets remain at least 44px.
- Resting card shadow: 0 1px 2px at 5% black. Header: opaque white with 0 1px 8px shadow at 4% black. Latest owner revision localizes glass to three sidebar elements below. Focus outline 2px amber, offset 2px; motion honors reduced-motion preferences.
- Inventory keeps both card and table presentations of the same real item records. Search, pagination, selected-item URLs, unit cursors and separate operational dimensions remain intact. Missing catalog photos have an explicit text fallback; Figma stock photos and fake availability counts are not attached to real records.
- Dashboard may show explicitly labelled demonstration borrowing/occupancy statistics. Do not fabricate guest activity, alerts, real inventory totals, shifts, room records or working borrowing actions.
- Display name: **Mövenpick Hotel**. Show the authenticated account, not the Figma example profile. No unapproved hotel logo is implied by the text brand.
- The reference's PMS sync, barcode, categories, pantry distribution and future report actions are omitted under the owner's confirmed scope. See `PROJECT.md` for manual booking entry and deferred implementation.

Acceptance: preserve access checks and all existing data controls, use the inspected Figma colors/layout/type, verify desktop/tablet/mobile without horizontal page overflow, and record actual lint/typecheck/test/browser evidence in `docs/DEVLOG.md`. Screenshots are local review artifacts under `output/playwright/`; they may contain local account/inventory data and are not production assets.

## 2026-10-22 — Login palette follow-up

The owner separately requested aligning login with the Figma workspace base palette while retaining its current layout and glass treatment. This supersedes the earlier instruction to retain crimson/dark login colors: navy photographic overlay, dark navy translucent panel/fields, white form text and amber action now reuse ws-* tokens. The owner rejected the initial white panel; restore the former glass densities (panel 40%, fields 25%) and white emblem, with orange focus outlines. Desktop/mobile composition and all authentication behavior remain as implemented. Exact alpha/fallback values and asset handling are recorded in docs/LOGIN-DESIGN.md.

## 2026-10-22 — Approved sidebar and unit-panel follow-up

Owner selected audit items 2 and 4 and requested a collapsible desktop sidebar plus a hidden mobile sidebar opened from the top-left button. The supplied dark screenshot describes panel composition; it does not replace the Figma workspace palette.

- Desktop sidebar: 288px expanded, 72px collapsed, with real route icons, accessible names/native titles and a compact logout icon. Collapse is local UI state, retained while the workspace layout remains mounted; no saved preference or theme is implied.
- Below 1024px, sidebar becomes a left native modal dialog opened from a 44px header control. It closes via its button, Escape, backdrop or route selection; resize to desktop closes it. Background scrolling is restored on close.
- Selecting an item opens its existing unit data immediately in a right panel. At viewport widths >=1440px the panel is nonmodal, 440px wide, below the 64px header, and reserves content space. Below 1440px it is a modal dialog with a black 35% backdrop; below 640px it fills the viewport width. Escape/button/backdrop remove selection while preserving normalized q/page. The native modal contains keyboard focus; closing restores the prior connected trigger.
- Unit information is presented as a compact table with unit identity, serial, custody, condition, readiness, loss, location and lifecycle, using existing service data. Empty/missing-item states and unit cursor links remain. No fake photos, unit counts, history or mutation buttons are added.
- Long item headings wrap within panel boundaries and are visually clamped; a native disclosure exposes full long names. This also resolves audit item 1 as part of the new panel's responsive requirements.
- Missing-photo fallback is now 76px high after the compact-name revision below. Actual catalog image storage/rendering is not implemented.
- Entry/exit follow the latest motion revision below. No animation is added to inventory data or dashboard metrics.
- Dashboard breakdown duplication and page metadata are still proposals awaiting the owner's choice; this task does not modify them.

## 2026-10-22 — Owner motion, glass and typography revision

This approved revision supersedes earlier workspace font, grid and motion values. Login and operational behavior remain unchanged.

- Workspace uses locally available Inter, normal tracking, headings at 600 and item names at 500. No new font download without owner approval.
- Cards stay 264px wide with 16px gaps, shrinking only below that available width. Auto-fill adds columns instead of stretching cards; center the grid tracks with justify-center so spare space is balanced. Verified at 1280px: three columns expanded, four collapsed. Name lane is 40px, vertically centering short names and clamping long names to two 20px lines. Owner subsequently requested a larger photo area: current photo fallback/skeleton is 144px high, superseding the earlier 76px/30% target.
- Cards represent item types. Detail barang opens the selected type's actual physical units; Memuat detail… marks pending navigation. This owner-requested wording supersedes Lihat unit fisik. Panel shows the real registered count and explains that every code is one physical item. Registered count is not borrowable stock. Existing operational fields and cursors remain authoritative.
- Sidebar grid transition: 420ms. Left mobile sidebar and right unit panel enter over 420ms and exit over 280ms using cubic-bezier(0.16, 1, 0.3, 1). Shared active navigation background moves vertically over 380ms. Reduced-motion disables movement. Dialog close and scroll restoration occur before waiting for selection-removal navigation.
- Three glass areas only: Operasional hotel, active navigation background, account box. Navy #131B2E beneath white 7% surface, white 14% one-pixel border, inset white 10% highlight, 10px backdrop blur. This explicitly approved exception overrides earlier flat-sidebar and antislop R-10 rules. Blur over flat navy is subtle; do not invent a gradient/image to amplify it. Header is opaque white.
- Account says Selamat datang, real name below, existing Phosphor sign-out icon beside it. Icon-only logout retains accessible name, pending handling, error announcement and 44px target.
- Navigation/data wait is separate from animation time. Local frame sampling is diagnostic evidence, not a production smoothness guarantee or backend optimization claim.
