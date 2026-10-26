# Nama unit — backend

Status26Oktober2026, base6bd5e14: implementasi langsung disetujui owner untuk nama unit saja. Tidak menambah endpoint, approval, dependency, unique-name constraint atau fitur foto. Frontend belum diaktifkan.

## Data dan kontrak

- ItemUnit.name: nullable TEXT, nama manusia opsional; boleh sama antarunit. UUID/unitNumber/kode HK tetap identitas yang sama. Migration20261026010000_item_unit_name hanya ADD COLUMN, tidak melakukan backfill/rename/drop.
- unitNameSchema di server/item-unit-input.ts dipakai bersama PATCH dan input units Add Stock: string opsional/nullable, trim, maksimum100karakter setelah trim, lalu collapse whitespace. Blank/null menjadi null; omitted tetap undefined pada PATCH dan mempertahankan nama lama. Batch tanpa unit details/nama tetap valid.
- POST /api/stock-batches: units[i].name opsional. Nama tersimpan dalam transaksi batch/unit/audit yang sama. Nama terisi masuk canonical requestHash; nama kosong/null/omitted dihilangkan dari canonical object agar replay batch sebelum fitur nama tetap cocok. Nama berubah dengan requestId sama menghasilkan REQUEST_CONFLICT, tidak menambah unit lagi. Batas batch/lokasi/status/izin existing tidak berubah.
- PATCH /api/item-units/[unitId]: name-only atau digabung serialNumber/notes. FOR UPDATE existing mencegah lost updates saat koreksi parsial bersamaan. Omitted field dipertahankan; perubahan kosong/null membersihkan nama. No-op tidak mengubah waktu atau menambah audit. actor berasal dari sesi, tidak dari body.
- getItemUnits dan GET /api/items/[itemId]/units mengembalikan name pada tiap unit; PATCH response juga memuat name. Header unit pada GET /api/item-units/[unitId]/history memuat nama saat ini, sedangkan event menyimpan snapshot lama/baru.
- STOCK_UNIT_CREATED/newValues mencakup name; ITEM_UNIT_DETAILS_UPDATED/oldValues/newValues mencakup name/serialNumber/notes. Event lama tanpa name tetap sah dan tidak ditulis ulang. Riwayat baca mengikuti inventory:view; koreksi mengikuti inventory:unit:update; Add Stock mengikuti inventory:stock:add.

## Rollout dan batas FE

- Agent menjalankan db:generate, db:validate, db:migrate:test dan db:migrate. Migrasi test/dev berhasil; tidak mengubah data operasional dev selain schema aditif. Semua actor/mutasi tes berada di housekeeping_test dengan guard env existing.
- Ditemukan direktori lama20261023050000_item_unit_name kosong/tidak tracked, sisa rollback23Oktober. Dihapus hanya setelah path diverifikasi dan dipastikan kosong; tidak menghapus file migrasi/data. Percobaan deploy test awal P3015 berhenti karena folder itu; deploy berikutnya berhasil tanpa reset.
- Restart npm run dev setelah pembaruan generated Prisma client agar global cached client tidak memakai model lama. Tidak ada restart server/user process otomatis pada slice ini.
- FE Add Unit/Edit masih disabled untuk nama; inventory page masih memasok name:null. Integrasi FE berikutnya perlu mengaktifkan input/payload, membaca unit.name, memvalidasi response nama serta menampilkan perubahan nama pada history dengan komponen existing. Jangan menganggap nama sudah terlihat/tersimpan dari form sekarang. Foto, peminjaman dan return tetap di luar scope.

## Verifikasi26Oktober

Prisma generate/validate dan typecheck passed. Targeted lint source/tests passed. Unit18file/164test passed; focused integration3file/102test passed; full31file/458test passed. Coverage mencakup validasi nama, nama berulang/null/blank, preserve omitted/no-op, persistence/read/audit, legacy request hash/replay/conflict, koreksi nama-seri-notes bersamaan dan regression izin/status existing. Tidak ada browser/build/production deployment pada langkah ini. Hasil full lint dicatat terpisah di DEVLOG.
