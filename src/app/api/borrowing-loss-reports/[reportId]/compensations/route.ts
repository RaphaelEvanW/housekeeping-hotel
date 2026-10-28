import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { proposeCompensation } from "@/server/borrowing-loss-settlement";

export function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  return createBorrowingLossPost(
    "loss:settle:propose",
    async (body, actorId) => {
      const { reportId } = await context.params;
      return proposeCompensation(reportId, body, actorId);
    },
    201,
  )(request);
}
