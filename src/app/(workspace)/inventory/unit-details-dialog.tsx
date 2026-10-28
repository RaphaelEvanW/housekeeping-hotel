"use client";

import { useEffect, useRef, useState, type SubmitEvent } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { normalizeUnitName, unitDisplayName } from "@/lib/unit-display-name";
import { FieldError } from "@/components/field-error";
import { useInventoryForm } from "@/lib/use-inventory-form";
import type { UnitCondition } from "@/generated/prisma/enums";
import { UnitHistory } from "./unit-history";
import { ReportUnitDamageDialog } from "../guests/report-unit-damage-dialog";
import { maintenanceHandoverId } from "@/lib/unit-maintenance-view";
import { UnitMaintenanceDialog } from "./unit-maintenance-dialog";

type UnitDetails = {
  id: string;
  itemId: string;
  unitCode: string;
  name: string | null;
  serialNumber: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
  condition: UnitCondition;
  statusLabel: string;
  facts: { label: string; value: string }[];
};

const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-sidebar/25 bg-ws-surface px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60";
const primaryClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";
const dateFormat = new Intl.DateTimeFormat("id-ID", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Asia/Jakarta",
});

export function UnitDetailsDialog({
  unit,
  itemName,
  canEdit,
  canUpdateCondition,
  canHandoverToEngineering = false,
  canReceiveFromEngineering = false,
  locations = [],
}: {
  unit: UnitDetails;
  itemName: string;
  canEdit: boolean;
  canUpdateCondition: boolean;
  canHandoverToEngineering?: boolean;
  canReceiveFromEngineering?: boolean;
  locations?: { id: string; name: string }[];
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const nameInput = useRef<HTMLInputElement>(null);
  const editButton = useRef<HTMLButtonElement>(null);
  const [attempted, setAttempted] = useState<{
    name: string | null;
    serialNumber: string | null;
    notes: string | null;
  } | null>(null);
  const inFlight = useRef(false);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [pending, setPending] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [expired, setExpired] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [current, setCurrent] = useState(unit);
  const headingId = `unit-details-${unit.id}`;
  const displayName = unitDisplayName(current);

  useEffect(() => {
    if (!open) return;
    const element = dialog.current!;
    const overflow = document.body.style.overflow;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    element.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      element.close();
      document.body.style.overflow = overflow;
      if (previousFocus?.isConnected)
        previousFocus.focus({ preventScroll: true });
    };
  }, [open]);

  useEffect(() => {
    if (editing) nameInput.current?.focus();
    else if (open) editButton.current?.focus();
  }, [editing, open]);

  function begin() {
    if (unconfirmed) {
      setEditing(true);
      setOpen(true);
      return;
    }
    setCurrent((previous) =>
      Date.parse(unit.updatedAt) >= Date.parse(previous.updatedAt)
        ? unit
        : previous,
    );
    validation.reset();
    setEditing(false);
    setError("");
    setSuccess(false);
    setUnconfirmed(false);
    setExpired(false);
    setOpen(true);
  }

  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canEdit || inFlight.current || unconfirmed) return;
    if (!validation.validate(event.currentTarget)) return;
    const values = new FormData(event.currentTarget);
    const payload = {
      name: normalizeUnitName(String(values.get("name") ?? "")),
      serialNumber: String(values.get("serialNumber") ?? "").trim() || null,
      notes: String(values.get("notes") ?? "").trim() || null,
    };
    const json = JSON.stringify(payload);
    setError("");
    setExpired(false);
    if (new TextEncoder().encode(json).byteLength > 256 * 1024) {
      setError("Data terlalu besar. Ringkas nomor seri atau deskripsi unit.");
      return;
    }
    inFlight.current = true;
    setAttempted(payload);
    setPending(true);
    try {
      const response = await fetch(`/api/item-units/${unit.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: json,
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200) {
        if (
          !body ||
          typeof body !== "object" ||
          !("unit" in body) ||
          !body.unit ||
          typeof body.unit !== "object"
        )
          throw new Error("Unconfirmed unit update");
        const saved = body.unit;
        if (
          !("id" in saved) ||
          saved.id !== unit.id ||
          !("itemId" in saved) ||
          saved.itemId !== unit.itemId ||
          !("unitCode" in saved) ||
          saved.unitCode !== unit.unitCode ||
          !("name" in saved) ||
          saved.name !== payload.name ||
          !("serialNumber" in saved) ||
          saved.serialNumber !== payload.serialNumber ||
          !("notes" in saved) ||
          saved.notes !== payload.notes ||
          !("updatedAt" in saved) ||
          typeof saved.updatedAt !== "string" ||
          !Number.isFinite(Date.parse(saved.updatedAt))
        )
          throw new Error("Unconfirmed unit update");
        const updatedAt = saved.updatedAt;
        setCurrent((previous) => ({ ...previous, ...payload, updatedAt }));
        setAttempted(null);
        setEditing(false);
        setSuccess(true);
        router.refresh();
      } else if ([400, 401, 403, 404, 413, 415].includes(response.status)) {
        setAttempted(null);
        setExpired(response.status === 401);
        setError(
          response.status === 401
            ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
            : response.status === 403
              ? "Anda tidak memiliki izin mengubah unit."
              : response.status === 404
                ? "Unit tidak ditemukan. Muat ulang daftar barang."
                : "Periksa nama, nomor seri, dan deskripsi unit sebelum menyimpan kembali.",
        );
      } else throw new Error("Unconfirmed unit update");
    } catch {
      setUnconfirmed(true);
      setError(
        "Hasil perubahan belum dapat dipastikan. Muat ulang data sebelum mengubah unit lagi.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }

  return (
    <>
      <button
        type="button"
        aria-label={
          displayName === unit.unitCode
            ? `Detail unit ${unit.unitCode}`
            : `Detail unit ${displayName} (${unit.unitCode})`
        }
        aria-haspopup="dialog"
        onClick={begin}
        className="inline-flex min-h-11 max-w-full flex-col items-start justify-start gap-1 rounded text-left text-sm leading-5 font-medium text-ws-strong underline-offset-4 hover:text-ws-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary"
      >
        <span className="line-clamp-2 [overflow-wrap:anywhere]">
          {displayName}
        </span>
        <span className="text-xs leading-5 font-normal text-ws-text">{current.serialNumber || current.name ? unit.unitCode : "Tanpa nomor seri"}</span>
      </button>
      {open
        ? createPortal(
            <dialog
              ref={dialog}
              aria-labelledby={headingId}
              onClick={(event) => event.stopPropagation()}
              onKeyDown={(event) => {
                if (event.key === "Escape") event.stopPropagation();
              }}
              onCancel={(event) => {
                event.stopPropagation();
                if (inFlight.current) event.preventDefault();
                else setOpen(false);
              }}
              className="fixed inset-0 m-auto max-h-[calc(100svh-24px)] w-[calc(100%-24px)] max-w-xl flex-col overflow-hidden rounded-lg border-0 bg-ws-surface p-0 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 open:flex [color-scheme:light]"
            >
              <header className="shrink-0 border-b border-ws-divider px-5 pt-3 pb-4 sm:px-6">
              <div className="mb-4 flex items-center justify-between gap-3 border-b border-ws-divider pb-3">
                <p className="text-xs font-medium">
                  {editing ? "Edit unit" : "Detail unit"}
                </p>
                <button
                  type="button"
                  aria-label="Tutup detail unit"
                  disabled={pending}
                  onClick={() => setOpen(false)}
                  className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60"
                >
                  <WorkspaceControlIcon name="close" />
                </button>
              </div>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <h2
                    id={headingId}
                    className="font-heading text-lg leading-7 font-semibold text-ws-strong [overflow-wrap:anywhere]"
                  >
                    {unitDisplayName(current)}
                  </h2>
                  <p
                    title={itemName}
                    className="mt-1 line-clamp-2 text-sm leading-6 [overflow-wrap:anywhere]"
                  >
                    {itemName}
                  </p>
                    <p className="mt-2 flex items-start gap-2 text-xs leading-5">
                      <span aria-hidden="true" className="mt-1.5 size-2 shrink-0 rounded-full bg-ws-sidebar" />
                      <span className="[overflow-wrap:anywhere]">Status saat ini: <span className="font-medium text-ws-strong">{unit.statusLabel}</span></span>
                    </p>
                </div>
                {canEdit && !editing ? (
                  <button
                    ref={editButton}
                    type="button"
                    className="ws-button-secondary"
                    aria-label={`Edit unit ${unit.unitCode}`}
                    onClick={() => {
                      validation.reset();
                      setSuccess(false);
                      setError("");
                      setEditing(true);
                    }}
                  >
                    <WorkspaceControlIcon name="pencil" />
                    Edit
                  </button>
                ) : null}
              </div>
              <p
                role="status"
                className={success ? "mt-4 text-sm text-ws-success" : "sr-only"}
              >
                {success ? "Unit berhasil diperbarui." : ""}
              </p>
              </header>
              {editing ? (
                <form
                  onSubmit={submit}
                  noValidate
                  onInput={validation.onInput}
                  aria-busy={pending}
                  className="flex min-h-0 flex-col"
                >
                  <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
                  <fieldset
                    disabled={pending || unconfirmed}
                    className="min-w-0 space-y-4 border-0 p-0"
                  >
                    <div>
                      <label
                        htmlFor={`${headingId}-name`}
                        className="block text-sm font-medium text-ws-strong"
                      >
                        Nama unit{" "}
                        <span className="font-normal text-ws-text">
                          (opsional)
                        </span>
                      </label>
                      <input
                        ref={nameInput}
                        id={`${headingId}-name`}
                        name="name"
                        maxLength={100}
                        defaultValue={(unconfirmed ? attempted?.name : current.name) ?? ""}
                        className={inputClass}
                        aria-invalid={Boolean(validation.errors[`${headingId}-name`])}
                        aria-describedby={validation.errors[`${headingId}-name`] ? `${headingId}-name-error` : undefined}
                      />
                      <FieldError id={`${headingId}-name-error`} message={validation.errors[`${headingId}-name`]} />
                    </div>
                    <div>
                      <label
                        htmlFor={`${headingId}-serial`}
                        className="block text-sm font-medium text-ws-strong"
                      >
                        Nomor seri{" "}
                        <span className="font-normal text-ws-text">
                          (opsional)
                        </span>
                      </label>
                      <input
                        id={`${headingId}-serial`}
                        name="serialNumber"
                        defaultValue={
                          (unconfirmed
                            ? attempted?.serialNumber
                            : current.serialNumber) ?? ""
                        }
                        className={inputClass}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor={`${headingId}-notes`}
                        className="block text-sm font-medium text-ws-strong"
                      >
                        Deskripsi{" "}
                        <span className="font-normal text-ws-text">
                          (opsional)
                        </span>
                      </label>
                      <textarea
                        id={`${headingId}-notes`}
                        name="notes"
                        defaultValue={
                          (unconfirmed ? attempted?.notes : current.notes) ?? ""
                        }
                        rows={4}
                        className={`${inputClass} resize-none py-3`}
                      />
                    </div>
                  </fieldset>
                  <p
                    role="alert"
                    className={
                      error
                        ? "mt-4 text-sm leading-6 text-ws-danger"
                        : "sr-only"
                    }
                  >
                    {error}
                  </p>
                  {expired ? (
                    <a
                      href="/login"
                      className="mt-2 inline-flex min-h-11 items-center text-sm text-ws-primary underline"
                    >
                      Ke halaman masuk
                    </a>
                  ) : null}
                  </div>
                  <div className="flex shrink-0 flex-wrap justify-end gap-3 border-t border-ws-divider px-5 py-4 sm:px-6">
                    <button
                      type="button"
                      disabled={pending}
                      className="ws-button-secondary"
                      onClick={() => {
                        if (unconfirmed) setOpen(false);
                        else {
                          setEditing(false);
                          setError("");
                        }
                      }}
                    >
                      {unconfirmed ? "Tutup" : "Batal"}
                    </button>
                    {unconfirmed ? (
                      <button
                        type="button"
                        className={primaryClass}
                        onClick={() => window.location.reload()}
                      >
                        Muat ulang data
                      </button>
                    ) : (
                      <button
                        type="submit"
                        disabled={pending}
                        className={primaryClass}
                      >
                        {pending ? "Menyimpan…" : "Simpan"}
                      </button>
                    )}
                  </div>
                </form>
              ) : (
                <div className="min-h-0 overflow-y-auto overscroll-contain p-5 sm:p-6">
                  <UnitHistory
                    key={`${unit.id}-${current.updatedAt}`}
                    unitId={unit.id}
                    unitCode={unit.unitCode}
                    renderEventActions={(event) => {
                      const handoverId = maintenanceHandoverId(event);
                      if (!handoverId) return null;

                      return (
                        <UnitMaintenanceDialog
                          handoverId={handoverId}
                          unit={{
                            id: current.id,
                            displayName: unitDisplayName(current),
                            unitCode: current.unitCode,
                            itemName,
                            condition: current.condition,
                            updatedAt: current.updatedAt,
                          }}
                          canReceive={canReceiveFromEngineering}
                          locations={locations}
                          onDone={() => setOpen(false)}
                        />
                      );
                    }}
                  >
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-4 border-b border-ws-divider pb-5 text-sm sm:gap-x-6">
                    {[
                      { label: "Kode aset", value: unit.unitCode },
                      {
                        label: "Nomor seri",
                        value: current.serialNumber || "—",
                      },
                      ...unit.facts.filter((fact) => fact.label !== "Pemegang unit"),
                      {
                        label: "Ditambahkan",
                        value: dateFormat.format(new Date(unit.createdAt)),
                      },
                      {
                        label: "Diperbarui",
                        value: dateFormat.format(new Date(current.updatedAt)),
                      },
                    ].map((fact) => (
                      <div key={fact.label} className="min-w-0">
                        <dt className="text-xs text-ws-text">{fact.label}</dt>
                        <dd className="mt-1 leading-6 text-ws-strong [overflow-wrap:anywhere]">
                          {fact.value}
                        </dd>
                      </div>
                    ))}
                  </dl>
                  {canUpdateCondition ? (
                    <section
                      aria-label="Pemeriksaan kondisi unit"
                      className="mt-5 grid items-center gap-3 border-b border-ws-divider pb-5 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-ws-strong">
                          Pemeriksaan kondisi
                        </h3>
                        <p className="mt-1 text-xs leading-5 text-ws-text">
                          Menemukan kendala atau perubahan kondisi? Perbarui kondisi
                          unit dengan hasil pemeriksaan dan foto terbaru.
                        </p>
                      </div>
                      <ReportUnitDamageDialog
                        unit={{
                          id: current.id,
                          displayName: unitDisplayName(current),
                          itemName,
                          unitCode: current.unitCode,
                        }}
                        general={{
                          condition: current.condition,
                          expectedUpdatedAt: current.updatedAt,
                        }}
                        onDone={() => setOpen(false)}
                      />
                    </section>
                  ) : null}
                  {canHandoverToEngineering ? (
                    <section
                      aria-label="Penyerahan unit ke Engineering"
                      className="mt-5 grid items-center gap-3 border-b border-ws-divider pb-5 sm:grid-cols-[minmax(0,1fr)_auto]"
                    >
                      <div className="min-w-0">
                        <h3 className="text-sm font-bold text-ws-strong">
                          Perbaikan
                        </h3>
                        <p className="mt-1 text-xs leading-5">
                          Catat penyerahan unit beserta bukti kerusakannya.
                        </p>
                      </div>
                      <ReportUnitDamageDialog
                        unit={{
                          id: current.id,
                          displayName: unitDisplayName(current),
                          itemName,
                          unitCode: current.unitCode,
                        }}
                        handover={{
                          condition: current.condition,
                          expectedUpdatedAt: current.updatedAt,
                        }}
                        onDone={() => setOpen(false)}
                      />
                    </section>
                  ) : null}
                  <section className="mt-5">
                    <h3 className="text-sm font-medium text-ws-strong">
                      Deskripsi
                    </h3>
                    <p className="mt-2 whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere]">
                      {current.notes || "Belum ada deskripsi."}
                    </p>
                  </section>

                  </UnitHistory>
                </div>
              )}
            </dialog>,
            document.body,
          )
        : null}
    </>
  );
}
