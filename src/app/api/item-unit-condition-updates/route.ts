import { updateUnitCondition } from "@/server/report-unit-damage";
import { unitConditionUpdateInputSchema } from "@/server/unit-condition-update-input";
import { createUnitConditionPost } from "@/server/unit-condition-post";

export const POST = createUnitConditionPost({
  permission: "inventory:unit:condition:update",
  parseInput: (input) => unitConditionUpdateInputSchema.parse(input),
  save: updateUnitCondition,
});
