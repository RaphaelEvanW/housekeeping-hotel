import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { decideWriteOff } from "@/server/borrowing-loss-settlement";

export function POST(
  request: Request,
  context: { params: Promise<{ reportId: string; settlementId: string }> },
) {
  return createBorrowingLossPost(
    "write-off:approve",
    async (body, actorId) => {
      const { reportId, settlementId } = await context.params;
      return decideWriteOff(reportId, settlementId, body, actorId);
    },
    200,
  )(request);
}
