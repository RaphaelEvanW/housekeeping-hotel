# Nama unit — status FE saja

Koreksi scope23Oktober2026: pemilik belum mengizinkan implementasi backend nama unit. Implementasi backend/migrasi yang sempat ditambahkan sudah dicabut; database tidak pernah dimigrasikan oleh agent. Instruksi db:migrate/db:generate dari versi catatan sebelumnya tidak berlaku untuk revisi ini.

- Field nama unit pada Tambah/Edit unit adalah persiapan UI: disabled dengan pesan bahwa penyimpanan menunggu backend. Tidak dikirim ke API dan tidak dianggap tersimpan.
- Kontrak tetap serialNumber/notes; UUID dan kodeHK unchanged. Judul saat ini memakai serial lalu kode aset. Helper name→serial→code baru menerima nama nyata setelah backend mendukungnya.
- getItemUnits tidak meminta field name pada ItemUnit. Schema/API/service kembali ke kontrak sebelumnya; tidak perlu migrasi atau generate untuk fix ini.
- Ringkasan sukses memakai jenis barang dan seri dari penambahan terkonfirmasi. Nomor baris bukan ID aset. Validasi inline dan daftar ringkas tetap FE.
- Pemeriksaan tetap ditunda sesuai permintaan pemilik; tidak ada hasil lint/typecheck/browser/DB baru. Jika dev masih menampilkan error lama setelah refresh, restart dev agar modul lama dimuat ulang.

Nama unit opsional tetap keputusan produk, tetapi persistensi/audit/migrasinya harus menjadi tugas BE terpisah yang disetujui terlebih dahulu. Tidak ada migrasi nama unit yang perlu di-commit.
