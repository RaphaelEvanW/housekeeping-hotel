import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { decideBorrowingLoss } from "@/server/borrowing-loss";

export function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  return createBorrowingLossPost(
    "loss:decide",
    async (body, actorId) => {
      const { reportId } = await context.params;
      return decideBorrowingLoss(reportId, body, actorId);
    },
    200,
  )(request);
}
