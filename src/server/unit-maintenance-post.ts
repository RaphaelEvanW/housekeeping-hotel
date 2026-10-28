import "server-only";

import type { Permission } from "@/lib/permissions";
import { createUnitConditionPost } from "@/server/unit-condition-post";
import {
  handoverUnitInputSchema,
  receiveMaintainedUnitInputSchema,
} from "@/server/unit-maintenance-input";
import {
  handoverUnit,
  receiveMaintainedUnit,
  UnitMaintenanceError,
} from "@/server/unit-maintenance";

export function createUnitMaintenancePost(operation: "HANDOVER" | "RECEIPT") {
  const handover = operation === "HANDOVER";
  const permission: Permission = handover
    ? "maintenance:handover"
    : "maintenance:receive";

  return createUnitConditionPost({
    permission,
    invalidInputMessage: handover
      ? "Periksa unit, kondisi, penerima, catatan, dan foto serah-terima."
      : "Periksa serah-terima, kondisi, pekerjaan, lokasi, dan foto penerimaan.",
    parseInput: (raw) =>
      handover
        ? handoverUnitInputSchema.parse(raw)
        : receiveMaintainedUnitInputSchema.parse(raw),
    save: handover ? handoverUnit : receiveMaintainedUnit,
    mapError: (error) => {
      if (!(error instanceof UnitMaintenanceError)) return null;

      const status =
        ["PHOTOS_REQUIRED", "INVALID_TIME", "INVALID_WORK_RESULT"].includes(
          error.code,
        )
          ? 400
          : ["UNIT_NOT_FOUND", "HANDOVER_NOT_FOUND"].includes(error.code)
            ? 404
            : 409;

      return { error: error.code, message: error.message, status };
    },
  });
}
