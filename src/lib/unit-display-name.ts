export function unitDisplayName(unit: { name?: string | null; serialNumber: string | null; unitCode: string }) {
  return unit.name?.trim() || unit.serialNumber?.trim() || unit.unitCode;
}
