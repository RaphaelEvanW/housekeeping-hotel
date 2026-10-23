# Form Tambah unit — pengganti siap ditempel

Status: ARSIP usulan sebelum nama unit dan validasi inline ditambahkan. Jangan mengganti source saat ini dengan kandidat lama ini; perubahan terbaru sudah ada di source dan dicatat di docs/CONTEXT.md serta docs/DESIGN_SYSTEM.md. Bagian penerapan di bawah hanya rekaman historis.

## Terapkan satu langkah

Ganti seluruh isi `src/app/(workspace)/inventory/add-stock-dialog.tsx` dengan isi `output/add-stock-dialog.proposed.txt`. File TXT berisi kode TSX lengkap. Nama file source, export, API dan caller tetap memakai nama teknis existing.

## Perubahan tampilan

- Dialog maksimum672px, header dan footer tetap terlihat; hanya isi form yang scroll.
- Nama barang maksimum2baris, dengan disclosure nama lengkap untuk nama panjang.
- Jumlah dan lokasi satu baris di desktop, bertumpuk di mobile.
- Detail per unit berupa accordion; kondisi dan serial sejajar di desktop, deskripsi selebar form.
- Input putih, kelompok dipisahkan oleh jarak dan border tipis; warna/Inter mengikuti token existing.
- Tombol utama Simpan unit. Pending, uncertain retry, payload, required fields dan accordion tetap menggunakan implementasi existing.

Foto awal wajib belum dipasang: backend upload/persistensi unit belum tersedia. Jangan menganggap form ini sudah memenuhi requirement foto.

## Pemeriksaan setelah ditempel

Jalankan `npm.cmd run lint`, kemudian `npm.cmd run typecheck`. Buka form pada390px dan1366px; cek nama panjang, accordion1/3/100unit, nilai yang tetap tersimpan saat accordion ditutup, lokasi wajib, footer tetap terlihat dan pending/retry. Untuk pengujian simpan gunakan data uji yang memang hendak ditambahkan karena endpoint membuat unit nyata.

Kandidat diperiksa secara statis; pemeriksaan aplikasi/browser belum dijalankan karena source aplikasi tidak diubah. Jangan catat desain ini sebagai sudah terpasang atau test sebagai passed.
