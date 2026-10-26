# Registrasi kunjungan tamu

26 Oktober 2026, base5725a92, feature/backend. Implementasi BE pada working tree; agent belum menjalankan migrasi, generate, lint, typecheck atau tests. Aturan bisnis mengikuti PROJECT bagian4. FE registrasi dan daftar tamu belum dibuat; API daftar sudah ada, menunggu checks owner.

Flow dikonfirmasi owner26Oktober: registrasi dilakukan saat tamu hendak meminjam, bukan setiap kedatangan hotel. Record kunjungan sendiri belum berarti ada peminjaman. Detail kunjungan nantinya mengelompokkan beberapa issue occasions dan partial/combined returns; setiap waktu peminjaman tetap punya header, unit, foto dan audit tersendiri. Return outstanding tetap bisa dicatat sesudah checkout. GET /api/guest-visits kini tersedia pada working tree: q mencari nama/kamar/booking secara literal, status STAYING(default)/CHECKED_OUT/ALL, page1–1000, pageSize10(default)/maks50, no-store dan guests:view. Daftar belum punya counter borrowing karena modelnya belum ada.

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

## Peringatan duplikat

Kriteria implementasi yang dapat ditinjau ulang: kunjungan STAYING dengan nama normalized yang sama, kamar sama (case-insensitive, perbandingan literal), dan rentang tanggal overlap, termasuk batas tanggal yang sama. Booking tidak dipakai sebagai identitas tamu atau aturan auto-merge.

Tanpa `duplicateOverrideReason`, server mengembalikan409 POSSIBLE_DUPLICATE + matchingVisitId, tanpa menyimpan kunjungan/audit. FE berikutnya harus menampilkan peringatan dan meminta alasan. Boleh mengirim ulang ID yang sama dengan `duplicateOverrideReason` nonblank/max2000 setelah penolakan ini; berbeda dari retry hasil simpan yang belum pasti. Validasi duplikat selalu diulang saat penyimpanan.

Override tetap membuat kunjungan baru. IsDuplicate hanya true jika kandidat aktif juga mempunyai kedua tanggal yang persis sama. Kandidat exact diprioritaskan ketika beberapa kandidat overlap. Perbedaan tanggal tetap diperingatkan, tetapi tidak ditandai exact duplicate. Flag tidak memblokir peminjaman dan tidak memindahkan tanggung jawab. Kunjungan CHECKED_OUT dan rentang yang tidak overlap tidak menjadi kandidat.

Transaksi mengambil advisory lock per normalized primary name sebelum cek requestId/kandidat; tidak memerlukan dummy lock row. READ COMMITTED memberi snapshot baru setelah menunggu lock. Lock berlaku sampai transaksi selesai; hash collision hanya menambah antrean, bukan meloloskan duplikat. Raw query memakai parameter binding dan equality literal untuk kamar; karakter `%`/`_` bukan wildcard. Index nama/status/check-in membatasi pencarian kandidat.

## Penyimpanan dan kompatibilitas

Migration20261026030000 menambah bookingNumber nullable dan registrationRequestHash nullable CHAR(64). Record lama tetap null tanpa booking palsu/backfill identitas. Registrasi API baru wajib booking; DB memastikan hash valid dan row dengan hash punya booking nonnull/nonblank. Row legacy tanpa hash tidak bisa dipakai untuk replay registrasi baru.

Visit + event GUEST_VISIT_REGISTERED dibuat dalam satu transaksi. Audit mencatat aktor, waktu, alasan, snapshot registrasi, kandidat suspected/exact dan flag. Fingerprint tidak dikirim melalui read API. Field hash tidak berubah ketika field operasional dikoreksi kelak. Jangan menghapus history atau menggabungkan identitas lintas stay.

Source: server/guest-visit-input.ts, server/guest-visits.ts, server/list-guest-visits-input.ts, server/list-guest-visits.ts, API guest-visits/route.ts dan guest-visits/[visitId]/route.ts, lib/permissions.ts. Daftar dan count memakai snapshot RepeatableRead, urutan createdAt/id descending dan select publik yang sama. Belum ada endpoint koreksi, checkout atau borrowing.

## Checks oleh owner

Tidak ada perintah di bawah yang dijalankan agent. Nyalakan DB test/dev seperti biasa. Jalankan:

```bash
npm.cmd run db:validate
npm.cmd run db:generate
npm.cmd run db:migrate:test
npm.cmd run lint
npm.cmd run typecheck
npx.cmd vitest run tests/unit/guest-visit-input.test.ts tests/unit/permissions.test.ts tests/integration/guest-visits-api.test.ts tests/integration/guest-visit-schema.test.ts
npm.cmd test
```

Setelah checks test DB passed, terapkan migrasi ke DB development:

```bash
npm.cmd run db:migrate
```

Tests mencakup field/tanggal, legacy null booking, DB constraints, hak akses, body/origin, audit, replay/conflict, literal room matching, checkout exclusion, duplikat/override/flag, concurrent request dan rollback saat audit gagal. Hasil aktual belum diketahui. Tidak ada browser/form untuk diuji pada langkah BE ini.

Tes tambahan daftar: tests/unit/list-guest-visits-input.test.ts dan cases list pada tests/integration/guest-visits-api.test.ts. Setelah passed, commit BE sebelum pindah FE registrasi/daftar. Peminjaman tetap tahap terpisah setelah data kunjungan bisa dikelola.
