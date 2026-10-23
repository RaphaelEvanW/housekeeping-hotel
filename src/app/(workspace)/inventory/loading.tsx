import { WorkspacePageHeading } from "@/components/workspace-page-heading";

export default function InventoryLoading() {
  return (
    <div
      role="status"
      aria-label="Memuat inventaris"
      className="space-y-6 p-4 md:p-6 lg:p-8"
    >
      <WorkspacePageHeading>
        <h1 className="text-2xl font-semibold text-ws-strong">Inventaris</h1>
      </WorkspacePageHeading>
      <div aria-hidden="true" className="h-20 rounded-lg bg-ws-surface" />
      <div
        aria-hidden="true"
        className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,264px),264px))] justify-center gap-4"
      >
        {[0, 1, 2, 3, 4, 5].map((card) => (
          <div key={card} className="overflow-hidden rounded-lg bg-ws-surface">
            <div className="h-36 bg-ws-inset" />
            <div className="space-y-4 p-4">
              <div className="h-6 w-2/3 rounded bg-ws-inset" />
              <div className="h-14 rounded bg-ws-inset" />
              <div className="h-11 rounded bg-ws-inset" />
            </div>
          </div>
        ))}
      </div>
      <span className="sr-only">Memuat inventaris…</span>
    </div>
  );
}
