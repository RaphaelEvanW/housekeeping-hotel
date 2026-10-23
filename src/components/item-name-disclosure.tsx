import { WorkspaceControlIcon } from "@/components/workspace-control-icon";

export function ItemNameDisclosure({
  id,
  name,
  heading = "h2",
}: {
  id: string;
  name: string;
  heading?: "h2" | "h3";
}) {
  const Heading = heading;
  const headingClass = "font-heading text-lg leading-7 font-semibold tracking-normal text-ws-strong";

  if (name.length <= 80) {
    return <Heading id={id} className={`${headingClass} [overflow-wrap:anywhere]`}>{name}</Heading>;
  }

  return (
    <details className="group">
      <summary className="list-none rounded focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden">
        <Heading className={`${headingClass} flex items-start justify-between gap-3`}>
          <span id={id} className="min-w-0 flex-1 line-clamp-2 group-open:line-clamp-none [overflow-wrap:anywhere]">{name}</span>
          <span className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong group-hover:bg-ws-inset">
            <span className="sr-only group-open:hidden">Tampilkan nama lengkap barang</span>
            <span className="sr-only hidden group-open:inline">Ringkas nama barang</span>
            <span className="transition-transform duration-150 group-open:rotate-90 motion-reduce:transition-none">
              <WorkspaceControlIcon name="caretRight" />
            </span>
          </span>
        </Heading>
      </summary>
    </details>
  );
}
