export function unitDisplayName(unit: { name?: string | null; serialNumber: string | null; unitCode: string }) {
  return unit.name?.trim() || unit.serialNumber?.trim() || unit.unitCode;
}
export function normalizeUnitName(value: string) {
  return value.trim().replace(/\s+/gu, " ") || null;
}

