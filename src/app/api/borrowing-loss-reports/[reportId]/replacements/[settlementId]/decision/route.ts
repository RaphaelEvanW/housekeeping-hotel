import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { decideReplacement } from "@/server/borrowing-loss-settlement";

export function POST(
  request: Request,
  context: { params: Promise<{ reportId: string; settlementId: string }> },
) {
  return createBorrowingLossPost(
    "loss:settle:decide",
    async (body, actorId) => {
      const { reportId, settlementId } = await context.params;
      return decideReplacement(reportId, settlementId, body, actorId);
    },
    200,
  )(request);
}
