"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { LogoutButton } from "@/components/logout-button";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { WorkspaceBreadcrumbs } from "@/components/workspace-breadcrumbs";
import type { getNavigationItems } from "@/lib/navigation";
import { slidePanel } from "@/lib/panel-motion";

import { WorkspaceNavigation } from "./workspace-navigation";

const toggleClass = "inline-flex size-11 shrink-0 items-center justify-center rounded hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-accent";

export function WorkspaceShell({ userName, items, children }: {
  userName: string;
  items: ReturnType<typeof getNavigationItems>;
  children: ReactNode;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const mobileMenu = useRef<HTMLDialogElement>(null);
  const previousOverflow = useRef("");
  const mobileClosing = useRef(false);

  useEffect(() => {
    const dialog = mobileMenu.current;
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) mobileMenu.current?.close(); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      if (dialog?.open) {
        dialog.close();
        dialog.getAnimations().forEach(animation => animation.cancel());
        document.body.style.overflow = previousOverflow.current;
      }
    };
  }, []);

  function closeMobileMenu() {
    const dialog = mobileMenu.current;
    if (!dialog?.open || mobileClosing.current) return;
    mobileClosing.current = true;
    void slidePanel(dialog, "left", "exit").then(() => {
      if (dialog.isConnected) dialog.close();
      mobileClosing.current = false;
    });
  }
  function openMobileMenu() {
    previousOverflow.current = document.body.style.overflow;
    mobileMenu.current?.showModal();
    document.body.style.overflow = "hidden";
    if (mobileMenu.current) void slidePanel(mobileMenu.current, "left", "enter");
  }

  return (
    <div className={`min-h-svh bg-ws-background font-workspace text-ws-text [color-scheme:light] selection:bg-ws-primary/15 selection:text-ws-strong lg:grid motion-safe:transition-[grid-template-columns] motion-safe:duration-[420ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)] ${collapsed ? "lg:grid-cols-[72px_minmax(0,1fr)]" : "lg:grid-cols-[288px_minmax(0,1fr)]"}`}>
      <a href="#workspace-content" className="sr-only z-50 rounded bg-ws-primary px-4 py-3 text-white focus:not-sr-only focus:fixed focus:top-3 focus:left-3">Lewati ke konten utama</a>
      <aside aria-label="Sidebar desktop" className="sticky top-0 hidden h-svh min-w-0 flex-col bg-ws-sidebar text-ws-muted shadow-[0_1px_4px_rgba(0,0,0,0.15)] lg:flex">
        <div className={collapsed ? "p-3" : "px-6 pt-6 pb-4"}>
          <div className="flex items-center justify-between gap-2">
            {!collapsed ? <div className="min-w-0"><p className="font-heading text-base font-semibold tracking-normal text-white">Mövenpick Hotel</p><p className="mt-1 text-[11px] font-medium tracking-wide text-ws-accent uppercase">Housekeeping</p></div> : null}
            <button type="button" className={toggleClass} onClick={() => setCollapsed(value => !value)} aria-label={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"} aria-expanded={!collapsed} aria-controls="desktop-navigation" title={collapsed ? "Perluas sidebar" : "Ciutkan sidebar"}><WorkspaceControlIcon name="sidebar" /></button>
          </div>
          {!collapsed ? <div className="sidebar-glass mt-4 rounded-md p-2 text-xs leading-5"><p className="font-medium text-white">Operasional hotel</p><p>Inventaris dan unit fisik</p></div> : null}
        </div>
        <div id="desktop-navigation" className={`min-h-0 flex-1 overflow-y-auto pt-2 ${collapsed ? "px-3" : "px-4"}`}><WorkspaceNavigation items={items} collapsed={collapsed} /></div>
        <div className={collapsed ? "px-3 pb-4" : "sidebar-glass m-4 mt-6 rounded-lg p-3"}>
          <div className="flex min-w-0 items-center justify-between gap-2">
            {!collapsed ? <div className="min-w-0"><p className="text-[11px]">Selamat datang</p><p className="mt-1 break-words text-xs font-medium leading-5 text-white">{userName}</p></div> : null}
            <LogoutButton compact />
          </div>
        </div>
      </aside>

      <div className="min-w-0">
        <header className="sticky top-0 z-30 bg-white px-4 py-3 shadow-[0_1px_8px_rgba(0,0,0,0.04)] sm:px-8">
          <div className="flex min-h-10 items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <button type="button" aria-label="Buka sidebar" aria-haspopup="dialog" aria-controls="mobile-navigation" onClick={openMobileMenu} className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary lg:hidden"><WorkspaceControlIcon name="menu" /></button>
              <WorkspaceBreadcrumbs />
            </div>
            <p className="hidden max-w-52 truncate text-xs sm:block">{userName}</p>
          </div>
        </header>
        <div id="workspace-content" tabIndex={-1} className="min-w-0 focus:outline-none">{children}</div>
      </div>

      <dialog ref={mobileMenu} id="mobile-navigation" aria-labelledby="mobile-navigation-heading" onClose={() => { document.body.style.overflow = previousOverflow.current; }} onCancel={event => { event.preventDefault(); closeMobileMenu(); }} onClick={event => { const rect = event.currentTarget.getBoundingClientRect(); if (event.clientX > rect.right || event.clientY > rect.bottom) closeMobileMenu(); }} onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeMobileMenu(); } }} className="fixed inset-y-0 left-0 m-0 h-svh max-h-none w-[min(320px,calc(100vw-48px))] max-w-none border-0 bg-ws-sidebar p-4 text-ws-muted backdrop:bg-black/40 backdrop:transition-opacity backdrop:duration-[280ms] data-[closing=true]:backdrop:opacity-0 motion-reduce:backdrop:transition-none open:flex open:flex-col">
        <div className="mb-6 flex items-center justify-between gap-3"><div><h2 id="mobile-navigation-heading" className="font-heading font-semibold text-white">Mövenpick Hotel</h2><p className="mt-1 text-xs">Housekeeping</p></div><button type="button" aria-label="Tutup sidebar" onClick={closeMobileMenu} className={toggleClass}><WorkspaceControlIcon name="close" /></button></div>
        <div className="sidebar-glass mb-5 rounded-md p-3 text-xs leading-5"><p className="font-medium text-white">Operasional hotel</p><p>Inventaris dan unit fisik</p></div>
        <div className="min-h-0 flex-1 overflow-y-auto"><WorkspaceNavigation items={items} onNavigate={closeMobileMenu} /></div>
        <div className="sidebar-glass mt-6 flex items-center justify-between gap-2 rounded-lg p-3"><div className="min-w-0"><p className="text-[11px]">Selamat datang</p><p className="mt-1 break-words text-xs font-medium leading-5 text-white">{userName}</p></div><LogoutButton compact /></div>
      </dialog>
    </div>
  );
}
