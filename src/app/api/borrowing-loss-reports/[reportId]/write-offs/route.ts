import { createBorrowingLossPost } from "@/server/borrowing-loss-post";
import { proposeWriteOff } from "@/server/borrowing-loss-settlement";

export function POST(
  request: Request,
  context: { params: Promise<{ reportId: string }> },
) {
  return createBorrowingLossPost(
    "write-off:propose",
    async (body, actorId) => {
      const { reportId } = await context.params;
      return proposeWriteOff(reportId, body, actorId);
    },
    201,
  )(request);
}
