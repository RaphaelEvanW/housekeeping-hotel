import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function InventoryLoading() {
  return (
    <div
      role="status"
      aria-label="Memuat inventaris"
      className="mx-auto flex h-[calc(100svh-64px)] min-h-[400px] max-w-[1440px] flex-col gap-4 overflow-hidden p-4 md:p-6"
    >
      <WorkspacePageHeading className="shrink-0">
        <h1 className="text-xl font-semibold text-ws-strong">Inventaris</h1>
      </WorkspacePageHeading>
      <div aria-hidden="true" className="h-20 shrink-0 rounded-lg bg-ws-surface" />
      <div
        aria-hidden="true"
        className="grid min-h-0 grid-cols-[repeat(auto-fill,minmax(min(100%,264px),264px))] items-start justify-center gap-4 overflow-hidden"
      >
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="overflow-hidden rounded-lg bg-ws-surface">
            <div className="aspect-[4/3] bg-ws-inset" />
            <div className="space-y-4 p-4">
              <div className="h-6 w-2/3 rounded bg-ws-inset" />
              <div className="h-11 rounded bg-ws-inset" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat inventaris…</span>
    </div>
  );
}
