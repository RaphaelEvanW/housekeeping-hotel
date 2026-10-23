import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export function PaginationChevron({ direction }: { direction: "previous" | "next" }) {
  return <span aria-hidden="true" className={direction === "previous" ? "rotate-180" : undefined}><WorkspaceControlIcon name="caretRight" /></span>;
}
