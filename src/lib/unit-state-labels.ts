export const conditionLabels = {
  GOOD: "Baik",
  MINOR_DAMAGE: "Rusak ringan",
  DAMAGED: "Rusak",
  MISSING_PART: "Komponen kurang",
} as const;

export const readinessLabels = {
  CLEAR: "Siap",
  ON_HOLD: "Belum siap",
  PENDING_INSPECTION: "Perlu pemeriksaan",
  PENDING_VERIFICATION: "Menunggu verifikasi",
} as const;

export const custodyLabels = {
  HOUSEKEEPING: "Housekeeping",
  GUEST: "Tamu",
  ENGINEERING: "Engineering",
  EXTERNAL_VENDOR: "Vendor eksternal",
} as const;
