import type { ReactNode } from "react";
import { WorkspaceBackButton } from "@/components/workspace-back-button";

export function WorkspacePageHeading({ children, fallbackHref, className = "" }: {
  children: ReactNode;
  fallbackHref?: string;
  className?: string;
}) {
  return (
    <div className={`flex min-w-0 items-start gap-3 ${className}`}>
      {fallbackHref ? <WorkspaceBackButton fallbackHref={fallbackHref} /> : null}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
