# Registrasi kunjungan tamu

27 Oktober 2026, base83a85fe, feature/backend. FE sudah committed; revisi aturan konflik kamar BE ada di working tree. Lint/typecheck/tests revisi belum dijalankan dan tetap milik owner. Aturan bisnis mengikuti PROJECT bagian4.

Registrasi dilakukan saat tamu hendak meminjam, bukan setiap kedatangan hotel. Record kunjungan sendiri belum berarti ada peminjaman. Detail kunjungan mengelompokkan beberapa waktu peminjaman dan partial/combined returns dengan unit, foto dan audit masing-masing. Return outstanding tetap bisa dicatat sesudah checkout. GET /api/guest-visits mencari nama/kamar/booking secara literal, status STAYING(default)/CHECKED_OUT/ALL, page1–1000, pageSize10(default)/maks50, no-store dan guests:view.

## Kontrak

POST `/api/guest-visits`, JSON, origin aplikasi yang diizinkan. Permission `guests:create` hanya HK_STAFF/HK_SUPERVISOR. GET `/api/guest-visits/{visitId}` memakai `guests:view`, termasuk Management; System Admin tidak otomatis mendapat akses operasional. Seluruh response no-store.

Contoh payload (data pengujian, bukan tamu hotel):

```json
{
  "requestId": "1c884ffe-af17-42fc-8547-bebfbc6cfba0",
  "primaryGuestName": "Tamu Pengujian",
  "roomNumber": "A-101",
  "bookingNumber": "TEST-001",
  "checkInDate": "2026-10-26",
  "plannedCheckoutDate": "2026-10-28"
}
```

requestId adalah UUID yang dibuat sekali per percobaan registrasi dan menjadi GuestVisitID immutable. Retry setelah hasil belum pasti harus mempertahankan ID dan seluruh payload. Success201, replay200: `{visit, replayed}`. Perubahan payload/aktor pada ID yang sudah dipakai ditolak409 REQUEST_CONFLICT. Fingerprint registrasi disimpan terpisah dari field yang nanti bisa dikoreksi; retry tidak menimpa perubahan kamar/status atau mengaktifkan ulang kunjungan. Replay mengembalikan keadaan kunjungan saat ini, bukan memundurkannya ke snapshot registrasi.

Nama wajib/max200, kamar wajib/max30, booking wajib/max100. Whitespace awal/akhir dibuang dan spasi berulang diringkas pada tiga field tersebut. Nomor booking dimasukkan manual dan tidak dibuat unik, karena belum ada aturan uniqueness booking. Tanggal YYYY-MM-DD, kalender valid, checkout >= check-in; same-day stay diizinkan. Tanggal disimpan sebagai SQL DATE. Tanggal planned checkout tidak mengubah status otomatis. Status/aktor/flag tidak boleh dikirim client; input yang tidak dikenal ditolak.

## Konflik kamar dan rentang menginap

Kunjungan STAYING dengan kamar yang sama dan rentang menginap bertumpang tindih ditolak, termasuk bila nama tamunya berbeda. Kamar dibandingkan case-insensitive secara literal setelah normalisasi whitespace; nama dan nomor booking tidak menentukan konflik. Karakter %/_ tidak menjadi wildcard.

Keputusan tanggal final owner27Oktober: interval [check-in, planned checkout), sehingga tanggal checkout tidak ikut dihitung. Kunjungan26–28 dan28–30 di kamar yang sama diperbolehkan;27–29 bertumpang tindih dengan26–28. Kunjungan dengan check-in/checkout pada tanggal yang sama tidak memiliki interval menginap dan tidak memblokir kunjungan lain. CHECKED_OUT tidak menjadi kandidat konflik; planned checkout tetap tidak mengubah status secara otomatis.

Konflik mengembalikan409 POSSIBLE_DUPLICATE + matchingVisitId, tanpa menyimpan kunjungan/audit. FE membuka kunjungan tersebut atau meminta pengguna memperbaiki data. POST menolak field duplicateOverrideReason; alasan tidak bisa melewati konflik. ID request yang ditolak belum dipakai dan boleh dikirim kembali setelah data diperbaiki. Setelah save berhasil, retry wajib mempertahankan payload aslinya.

PATCH nama/kamar memakai pemeriksaan konflik yang sama terhadap tanggal tersimpan pada kunjungan STAYING dan mengecualikan dirinya sendiri. Alasan koreksi tetap wajib untuk audit; itu berbeda dari alasan override yang dihapus. AcknowledgeDuplicate false masih diterima karena FE existing mengirimnya; true ditolak400. Timestamp expectedUpdatedAt mencegah koreksi menimpa versi yang lebih baru. Koreksi kunjungan CHECKED_OUT tetap historis dan tidak memesan kamar.

Registrasi dan koreksi mengambil transaction advisory lock per kamar tujuan memakai lower PostgreSQL yang sama dengan query kandidat. Koreksi mengambil room lock sebelum FOR UPDATE kunjungan. READ COMMITTED membaca keadaan terbaru setelah menunggu lock; dua registrasi bernama berbeda atau registrasi yang bersamaan dengan pindah kamar tetap diserialkan. Query memakai parameter binding. Flag isDuplicate/audit legacy tetap terbaca; registrasi baru selalu isDuplicate false dan tidak menggabungkan kunjungan atau memindahkan tanggung jawab pinjaman.

## Penyimpanan dan kompatibilitas

Migration20261026030000 menambah bookingNumber nullable dan registrationRequestHash nullable CHAR(64). Record lama tetap null tanpa booking palsu/backfill identitas. Registrasi API baru wajib booking; DB memastikan hash valid dan row dengan hash punya booking nonnull/nonblank. Row legacy tanpa hash tidak bisa dipakai untuk replay registrasi baru.

Visit + event GUEST_VISIT_REGISTERED dibuat dalam satu transaksi. Audit mencatat aktor, waktu dan snapshot registrasi. Fingerprint tidak dikirim melalui read API dan tidak berubah saat field operasional dikoreksi. Bentuk fingerprint registrasi lama tanpa override dipertahankan agar replay tetap bekerja. Evidence override lama tidak ditulis ulang. Tidak ada schema/migration baru untuk revisi konflik ini.

Source: server/guest-visit-input.ts, guest-visits.ts, update-guest-visit.ts, list-guest-visits-input.ts, list-guest-visits.ts, API guest-visits/route.ts dan guest-visits/[visitId]/route.ts, lib/permissions.ts. Daftar dan count memakai snapshot RepeatableRead, urutan createdAt/id descending dan select publik yang sama. Checkout dan borrowing memakai endpoint terpisah yang sudah tersedia.

## Checks oleh owner

Tidak ada perintah di bawah yang dijalankan agent untuk revisi ini. Nyalakan DB test/dev seperti biasa. Jalankan:

```bash
npm.cmd run lint
npm.cmd run typecheck
npm.cmd test -- tests/unit/guest-visit-input.test.ts tests/integration/guest-visits-api.test.ts
npm.cmd test
```

Regresi mencakup konflik beda nama, batas checkout/check-in, same-day stays, penolakan override, replay fingerprint lama, flag/audit legacy, concurrency registrasi/koreksi, hak akses dan rollback. Fixture search literal memakai kamar berbeda agar pencarian tidak terhalang aturan okupansi baru. Hasil checks revisi belum diketahui. FE sudah tersambung ke error/link existing; E2E penuh belum selesai.
