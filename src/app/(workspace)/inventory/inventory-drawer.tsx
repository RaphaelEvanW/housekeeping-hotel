"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";

import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { slidePanel } from "@/lib/panel-motion";

export function InventoryDrawer({
  closeHref,
  children,
  footer,
}: {
  closeHref: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const router = useRouter();
  const panel = useRef<HTMLDialogElement>(null);
  const closing = useRef(false);
  const mounted = useRef(false);
  const restoreOverflow = useRef("");
  const dismiss = useCallback(() => {
    const dialog = panel.current;
    if (!dialog?.open || closing.current) return;
    closing.current = true;
    void slidePanel(dialog, "right", "exit").then(() => {
      if (!mounted.current) return;
      dialog.close();
      document.body.style.overflow = restoreOverflow.current;
      router.replace(closeHref, { scroll: false });
    });
  }, [router, closeHref]);

  useEffect(() => {
    const dialog = panel.current!;
    mounted.current = true;
    closing.current = false;
    const desktop = window.matchMedia("(min-width: 1440px)");
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    const previousOverflow = document.body.style.overflow;
    restoreOverflow.current = previousOverflow;
    const syncMode = () => {
      if (closing.current) return;
      if (dialog.open) dialog.close();
      if (desktop.matches) {
        dialog.show();
        dialog.removeAttribute("aria-modal");
        document.body.style.overflow = previousOverflow;
      } else {
        dialog.showModal();
        dialog.setAttribute("aria-modal", "true");
        document.body.style.overflow = "hidden";
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && desktop.matches) dismiss();
    };
    syncMode();
    void slidePanel(dialog, "right", "enter");
    desktop.addEventListener("change", syncMode);
    window.addEventListener("keydown", escape);
    return () => {
      mounted.current = false;
      desktop.removeEventListener("change", syncMode);
      window.removeEventListener("keydown", escape);
      dialog.close();
      dialog.getAnimations().forEach((animation) => animation.cancel());
      document.body.style.overflow = previousOverflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [dismiss]);

  return (
    <dialog
      id="inventory-unit-panel"
      ref={panel}
      aria-labelledby="units-heading"
      onCancel={(event) => {
        event.preventDefault();
        dismiss();
      }}
      onClick={(event) => {
        const rect = event.currentTarget.getBoundingClientRect();
        if (
          event.clientX < rect.left ||
          event.clientX > rect.right ||
          event.clientY < rect.top ||
          event.clientY > rect.bottom
        )
          dismiss();
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          dismiss();
        }
      }}
      className="fixed inset-y-0 right-0 left-auto z-40 m-0 h-svh max-h-none w-full max-w-none overflow-hidden overscroll-contain border-0 border-l border-ws-divider bg-white p-0 font-workspace text-ws-text shadow-xl outline-none backdrop:bg-black/35 backdrop:transition-opacity backdrop:duration-[280ms] data-[closing=true]:backdrop:opacity-0 open:flex open:flex-col sm:w-[440px] min-[1440px]:top-16 min-[1440px]:h-[calc(100svh-64px)] min-[1440px]:shadow-none motion-reduce:backdrop:transition-none"
    >
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-ws-divider px-4 py-3 sm:px-6">
        <p className="text-xs font-medium text-ws-text">
          Jenis barang terpilih
        </p>
        <button
          type="button"
          aria-label="Tutup daftar unit"
          onClick={dismiss}
          className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
        >
          <WorkspaceControlIcon name="close" />
        </button>
      </div>
      <div data-drawer-body className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 sm:px-6">
        {children}
      </div>
      {footer ? <div data-drawer-footer className="shrink-0 border-t border-ws-divider bg-white px-4 pt-3 pb-4 sm:px-6 sm:pb-6">{footer}</div> : null}
    </dialog>
  );
}
