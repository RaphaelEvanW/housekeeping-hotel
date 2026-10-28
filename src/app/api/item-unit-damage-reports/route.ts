import { reportUnitDamage } from "@/server/report-unit-damage";
import { reportUnitDamageInputSchema } from "@/server/report-unit-damage-input";
import { createUnitConditionPost } from "@/server/unit-condition-post";

export const POST = createUnitConditionPost({
  permission: "inventory:unit:damage:report",
  parseInput: (input) => reportUnitDamageInputSchema.parse(input),
  save: reportUnitDamage,
});
