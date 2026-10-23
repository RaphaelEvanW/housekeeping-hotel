"use client";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
  type SubmitEvent,
} from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { WorkspaceControlIcon } from "@/components/workspace-control-icon";
import { ItemNameDisclosure } from "@/components/item-name-disclosure";
import { FieldError } from "@/components/field-error";
import { useInventoryForm } from "@/lib/use-inventory-form";
type Item = {
  id: string;
  name: string;
};
type Unit = {
  serialNumber: string;
  notes: string;
  condition: string;
};
type Attempt = {
  requestId: string;
  itemId: string;
  initialLocationId: string;
  quantity: number;
  units: Unit[];
};
const StockContext = createContext<((item: Item) => void) | null>(null);
const conditions = {
  GOOD: "Baik",
  MINOR_DAMAGE: "Rusak ringan",
  DAMAGED: "Rusak",
  MISSING_PART: "Komponen tidak lengkap",
};
const inputClass =
  "mt-2 min-h-11 w-full min-w-0 rounded-md border border-ws-sidebar/40 bg-ws-surface px-3 text-sm text-ws-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60";
const actionClass =
  "inline-flex min-h-11 items-center justify-center rounded-md bg-ws-primary px-4 text-sm leading-5 font-medium tracking-[0.01em] text-white hover:bg-ws-primary-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:cursor-wait disabled:opacity-60";
export function AddStockButton({
  item,
  labelled = false,
  compact = false,
}: {
  item: Item;
  labelled?: boolean;
  compact?: boolean;
}) {
  const open = useContext(StockContext);
  if (!open)
    throw new Error("AddStockButton requires StockRegistrationProvider");
  return (
    <button
      type="button"
      onClick={() => open(item)}
      aria-label={`Tambah unit ${item.name}`}
      title="Tambah unit"
      aria-haspopup="dialog"
      className={`${actionClass} shrink-0 ${labelled ? "w-full gap-2" : "w-11 px-0"} ${compact ? "size-9! min-h-9! p-0! [&>svg]:size-4!" : ""}`}
    >
      <WorkspaceControlIcon name="plus" />
      {labelled ? <span>Tambah unit</span> : null}
    </button>
  );
}
export function StockRegistrationProvider({
  children,
  enabled,
  locations,
}: {
  children: ReactNode;
  enabled: boolean;
  locations: {
    id: string;
    name: string;
  }[];
}) {
  const router = useRouter();
  const validation = useInventoryForm();
  const dialog = useRef<HTMLDialogElement>(null);
  const form = useRef<HTMLFormElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const overflow = useRef("");
  const inFlight = useRef(false);
  const attempt = useRef<Attempt | null>(null);
  const [item, setItem] = useState<Item | null>(null);
  const [quantity, setQuantity] = useState("1");
  const [openUnit, setOpenUnit] = useState<number | null>(0);
  const [pending, setPending] = useState(false);
  const [uncertain, setUncertain] = useState(false);
  const [error, setError] = useState("");
  const [expired, setExpired] = useState(false);
  const [success, setSuccess] = useState(0);
  const [successUnits, setSuccessUnits] = useState<Unit[]>([]);
  const [unitTitles, setUnitTitles] = useState<
    Record<number, { serial?: string }>
  >({});
  useEffect(() => {
    if (!uncertain) return;
    const warnBeforeReload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
    };
    window.addEventListener("beforeunload", warnBeforeReload);
    return () => window.removeEventListener("beforeunload", warnBeforeReload);
  }, [uncertain]);
  useEffect(() => {
    const element = dialog.current;
    return () => {
      if (element?.open) {
        element.close();
        document.body.style.overflow = overflow.current;
      }
    };
  }, []);
  function open(selected: Item) {
    // shortcut: pending batch is page-local; reload recovery needs per-account persistence.
    if (!attempt.current) {
      setItem(selected);
      setQuantity("1");
      setOpenUnit(0);
      setError("");
      setExpired(false);
      setSuccess(0);
      setSuccessUnits([]);
      setUnitTitles({});
      validation.reset();
      setUncertain(false);
      form.current?.reset();
    }
    overflow.current = document.body.style.overflow;
    dialog.current?.showModal();
    document.body.style.overflow = "hidden";
    input.current?.focus();
  }
  async function submit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !item) return;
    if (!attempt.current) {
      if (!validation.validate(event.currentTarget)) return;
      const values = new FormData(event.currentTarget);
      const count = Number(quantity);
      if (!Number.isInteger(count) || count < 1 || count > 100) {
        setError("Jumlah unit harus 1–100.");
        return;
      }
      const initialLocationId = String(values.get("initialLocationId") ?? "");
      if (!locations.some((location) => location.id === initialLocationId)) {
        setError("Pilih lokasi awal yang aktif.");
        return;
      }
      const units = Array.from({ length: count }, (_, index) => ({
        serialNumber: String(values.get(`serial-${index}`) ?? "").trim(),
        notes: String(values.get(`notes-${index}`) ?? "").trim(),
        condition: String(values.get(`condition-${index}`) || "GOOD"),
      }));
      const payload = {
        requestId: crypto.randomUUID(),
        itemId: item.id,
        initialLocationId,
        quantity: count,
        units,
      };
      if (
        new TextEncoder().encode(JSON.stringify(payload)).byteLength >
        256 * 1024
      ) {
        setError("Data terlalu besar. Ringkas nomor seri atau deskripsi unit.");
        return;
      }
      attempt.current = payload;
    }
    const payload = attempt.current;
    inFlight.current = true;
    setPending(true);
    setError("");
    setExpired(false);
    try {
      const response = await fetch("/api/stock-batches", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body: unknown = await response.json().catch(() => null);
      if (response.status === 200 || response.status === 201) {
        if (
          !body ||
          typeof body !== "object" ||
          !("batch" in body) ||
          !body.batch ||
          typeof body.batch !== "object" ||
          !("id" in body.batch) ||
          body.batch.id !== payload.requestId ||
          !("quantity" in body.batch) ||
          body.batch.quantity !== payload.quantity ||
          !("itemId" in body.batch) ||
          body.batch.itemId !== payload.itemId
        )
          throw new Error("Unconfirmed batch");
        attempt.current = null;
        setUncertain(false);
        setSuccess(payload.quantity);
        setSuccessUnits(payload.units);
        router.refresh();
      } else if (response.status >= 400 && response.status < 500) {
        const code =
          body && typeof body === "object" && "error" in body
            ? body.error
            : null;
        if (code === "REQUEST_CONFLICT") {
          setUncertain(true);
          setError(
            "ID penambahan stok berbenturan. Jangan buat batch baru; hubungi pengelola untuk memeriksa hasilnya.",
          );
        } else if (
          [400, 401, 403, 404, 413, 415].includes(response.status) ||
          code === "ITEM_INACTIVE" ||
          code === "STORAGE_UNAVAILABLE" ||
          code === "LOCATION_UNAVAILABLE"
        ) {
          attempt.current = null;
          setUncertain(false);
          setExpired(response.status === 401);
          setError(
            response.status === 401
              ? "Sesi Anda berakhir. Masuk kembali untuk melanjutkan."
              : response.status === 403
                ? "Anda tidak memiliki izin menambah stok."
                : response.status === 404
                  ? "Jenis barang tidak ditemukan."
                  : code === "ITEM_INACTIVE"
                    ? "Jenis barang sudah nonaktif. Stok tidak dapat ditambahkan."
                    : code === "STORAGE_UNAVAILABLE" ||
                        code === "LOCATION_UNAVAILABLE"
                      ? "Lokasi awal tidak tersedia atau sudah nonaktif. Muat ulang daftar lokasi sebelum mencoba kembali."
                      : "Periksa jumlah dan detail unit sebelum menyimpan kembali.",
          );
        } else throw new Error("Unconfirmed rejection");
      } else throw new Error("Unconfirmed save");
    } catch {
      setUncertain(true);
      setError(
        "Hasil penyimpanan belum dapat dipastikan. Periksa ulang dengan tombol di bawah; ID batch tetap sama. Jangan muat ulang atau meninggalkan halaman sebelum hasilnya terkonfirmasi.",
      );
    } finally {
      inFlight.current = false;
      setPending(false);
    }
  }
  const count = Math.min(100, Math.max(0, Number(quantity) || 0));
  const locked = pending || uncertain;
  if (!enabled) return <>{children}</>;
  return (
    <StockContext.Provider value={open}>
      {children}
      <dialog
        ref={dialog}
        aria-labelledby="add-stock-heading"
        aria-describedby="add-stock-item"
        onKeyDown={(event) => {
          if (event.key === "Escape") event.stopPropagation();
        }}
        onCancel={(event) => {
          if (inFlight.current) event.preventDefault();
        }}
        onClose={() => {
          document.body.style.overflow = overflow.current;
        }}
        className="fixed inset-0 m-auto max-h-[calc(100svh-24px)] w-[calc(100%-24px)] max-w-2xl flex-col overflow-hidden rounded-lg border-0 bg-ws-surface p-0 font-workspace text-ws-text shadow-xl backdrop:bg-black/35 open:flex [color-scheme:light]"
      >
        <header className="shrink-0 border-b border-ws-divider px-5 py-5 sm:px-7">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0 flex-1">
              <ItemNameDisclosure
                id="add-stock-heading"
                name={`Tambah unit — ${item?.name ?? ""}`}
              />
            </div>
            <button
              type="button"
              aria-label="Tutup tambah unit"
              disabled={pending}
              onClick={() => dialog.current?.close()}
              className="inline-flex size-11 shrink-0 items-center justify-center rounded text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ws-primary disabled:opacity-60"
            >
              <WorkspaceControlIcon name="close" />
            </button>
          </div>
          <p id="add-stock-item" className="sr-only">
            Jenis barang: {item?.name}
          </p>
        </header>
        {success ? (
          <>
            <div className="overflow-y-auto overscroll-contain p-5 sm:p-7">
              <h3 className="text-lg font-semibold text-ws-strong">
                Penambahan unit berhasil
              </h3>
              <p role="status" className="mt-2 text-sm text-ws-success">
                {success} unit berhasil ditambahkan.
              </p>
              <table className="mt-5 w-full table-fixed text-left text-sm">
                <caption className="sr-only">
                  Unit dalam penambahan yang berhasil dikonfirmasi
                </caption>
                <thead className="border-b border-ws-divider text-xs text-ws-text">
                  <tr>
                    <th className="w-10 pb-3 font-medium" scope="col">
                      No.
                    </th>
                    <th className="pb-3 pr-3 font-medium" scope="col">
                      Nama unit
                    </th>
                    <th className="w-[38%] pb-3 font-medium" scope="col">
                      Nomor seri
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ws-divider">
                  {successUnits.map((unit, index) => (
                    <tr key={index} className="align-top">
                      <td className="py-3 tabular-nums">{index + 1}</td>
                      <td className="py-3 pr-3 text-ws-strong [overflow-wrap:anywhere]">
                        {item?.name}
                      </td>
                      <td className="py-3 [overflow-wrap:anywhere]">
                        {unit.serialNumber || "Tanpa nomor seri"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <footer className="flex shrink-0 justify-end border-t border-ws-divider px-5 py-4 sm:px-7">
              <button
                type="button"
                onClick={() => dialog.current?.close()}
                className={actionClass}
              >
                Selesai
              </button>
            </footer>
          </>
        ) : (
          <form
            ref={form}
            onSubmit={submit}
            noValidate
            onInput={validation.onInput}
            aria-busy={pending}
            className="flex min-h-0 flex-1 flex-col"
          >
            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-5 sm:px-7">
              <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="text-sm font-semibold text-ws-strong">
                  Penambahan unit
                </h3>
                <p className="text-xs">* Wajib diisi</p>
              </div>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-[144px_minmax(0,1fr)]">
                <div>
                  <label
                    htmlFor="stock-quantity"
                    className="block text-sm font-medium text-ws-strong"
                  >
                    Jumlah unit <span aria-hidden="true">*</span>
                  </label>
                  <input
                    ref={input}
                    id="stock-quantity"
                    name="quantity"
                    type="number"
                    min={1}
                    max={100}
                    step={1}
                    required
                    value={quantity}
                    onChange={(event) => {
                      setQuantity(event.target.value);
                      setOpenUnit(null);
                      const nextCount = Math.floor(
                        Math.max(
                          0,
                          Math.min(100, Number(event.target.value) || 0),
                        ),
                      );
                      setUnitTitles((previous) =>
                        Object.fromEntries(
                          Object.entries(previous).filter(
                            ([index]) => Number(index) < nextCount,
                          ),
                        ),
                      );
                    }}
                    disabled={locked}
                    aria-invalid={Boolean(validation.errors["stock-quantity"])}
                    aria-describedby="stock-quantity-help stock-quantity-error"
                    data-invalid-message="Jumlah unit harus bilangan bulat 1–100."
                    className={`${inputClass} [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none`}
                  />
                  <p
                    id="stock-quantity-help"
                    className="mt-2 text-xs leading-5"
                  >
                    1-100 unit per penambahan
                  </p>
                  <FieldError
                    id="stock-quantity-error"
                    message={validation.errors["stock-quantity"]}
                  />
                </div>
                <div>
                  <label
                    htmlFor="stock-location"
                    className="block text-sm font-medium text-ws-strong"
                  >
                    Lokasi awal <span aria-hidden="true">*</span>
                  </label>
                  <select
                    id="stock-location"
                    name="initialLocationId"
                    defaultValue=""
                    required
                    disabled={locked || locations.length === 0}
                    data-required-message="Pilih lokasi awal."
                    aria-invalid={Boolean(validation.errors["stock-location"])}
                    aria-describedby={
                      validation.errors["stock-location"]
                        ? "stock-location-error"
                        : undefined
                    }
                    className={inputClass}
                  >
                    <option value="" disabled>
                      Pilih lokasi awal
                    </option>
                    {locations.map((location) => (
                      <option key={location.id} value={location.id}>
                        {location.name}
                      </option>
                    ))}
                  </select>
                  <FieldError
                    id="stock-location-error"
                    message={validation.errors["stock-location"]}
                  />
                  {locations.length === 0 ? (
                    <p
                      role="alert"
                      className="mt-2 text-sm leading-6 text-ws-danger"
                    >
                      Belum ada lokasi aktif. Hubungi pengelola untuk menyiapkan
                      lokasi.
                    </p>
                  ) : null}
                </div>
              </div>
              <div className="mt-7 mb-3 flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ws-strong">
                  Detail tiap unit
                </h3>
                <p className="text-xs tabular-nums">{count} unit</p>
              </div>
              <div className="space-y-3">
                {Array.from({ length: count }, (_, index) => (
                  <details
                    key={index}
                    name="stock-units"
                    open={openUnit === index}
                    onToggle={(event) => {
                      const expanded = event.currentTarget.open;
                      setOpenUnit((current) =>
                        expanded ? index : current === index ? null : current,
                      );
                    }}
                    className="group min-w-0 overflow-hidden rounded-lg border border-ws-sidebar/25 open:border-ws-sidebar/35"
                  >
                    <summary
                      id={`stock-unit-heading-${index}`}
                      className="flex min-h-14 list-none items-center justify-between gap-3 bg-ws-background px-4 py-3 text-sm font-medium text-ws-strong hover:bg-ws-inset focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ws-primary [&::-webkit-details-marker]:hidden"
                    >
                      <span className="min-w-0 line-clamp-2 text-left [overflow-wrap:anywhere]">
                        <span className="tabular-nums">{index + 1}</span> —{" "}
                        {item?.name} —{" "}
                        <span className="font-normal text-ws-text">
                          {unitTitles[index]?.serial?.trim() ||
                            "Tanpa nomor seri"}
                        </span>
                      </span>
                      <span className="text-xs text-ws-primary group-open:hidden">
                        Buka
                      </span>
                      <span className="hidden text-xs text-ws-primary group-open:inline">
                        Tutup
                      </span>
                    </summary>
                    <fieldset
                      aria-labelledby={`stock-unit-heading-${index}`}
                      disabled={locked}
                      className="grid min-w-0 grid-cols-1 gap-4 border-0 p-4 sm:grid-cols-2"
                    >
                      <div className="min-w-0 sm:col-span-2">
                        <label
                          htmlFor={`stock-unit-name-${index}`}
                          className="block text-sm font-medium text-ws-strong"
                        >
                          Nama unit{" "}
                          <span className="font-normal text-ws-text">
                            (opsional)
                          </span>
                        </label>
                        <input
                          id={`stock-unit-name-${index}`}
                          disabled
                          value=""
                          readOnly
                          className={inputClass}
                          aria-describedby={`stock-unit-name-help-${index}`}
                        />
                        <p
                          id={`stock-unit-name-help-${index}`}
                          className="mt-2 text-xs leading-5"
                        >
                          belom bisa nih, sabar ye, perlu jadiin backendnya dlu,
                          makasih.
                        </p>
                      </div>
                      <div className="min-w-0">
                        <label
                          htmlFor={`stock-unit-condition-${index}`}
                          className="block text-sm font-medium text-ws-strong"
                        >
                          Kondisi unit <span aria-hidden="true">*</span>
                        </label>
                        <select
                          id={`stock-unit-condition-${index}`}
                          name={`condition-${index}`}
                          defaultValue="GOOD"
                          required
                          aria-invalid={Boolean(
                            validation.errors[`stock-unit-condition-${index}`],
                          )}
                          aria-describedby={
                            validation.errors[`stock-unit-condition-${index}`]
                              ? `stock-unit-condition-error-${index}`
                              : undefined
                          }
                          className={inputClass}
                        >
                          {Object.entries(conditions).map(([value, label]) => (
                            <option key={value} value={value}>
                              {label}
                            </option>
                          ))}
                        </select>
                        <FieldError
                          id={`stock-unit-condition-error-${index}`}
                          message={
                            validation.errors[`stock-unit-condition-${index}`]
                          }
                        />
                      </div>
                      <div className="min-w-0">
                        <label
                          htmlFor={`stock-serial-${index}`}
                          className="block text-sm font-medium text-ws-strong"
                        >
                          Nomor seri{" "}
                          <span className="font-normal text-ws-text">
                            (opsional)
                          </span>
                        </label>
                        <input
                          id={`stock-serial-${index}`}
                          name={`serial-${index}`}
                          className={inputClass}
                          onChange={(event) =>
                            setUnitTitles((previous) => ({
                              ...previous,
                              [index]: {
                                ...previous[index],
                                serial: event.target.value,
                              },
                            }))
                          }
                        />
                      </div>
                      <div className="min-w-0 sm:col-span-2">
                        <label
                          htmlFor={`stock-notes-${index}`}
                          className="block text-sm font-medium text-ws-strong"
                        >
                          Deskripsi{" "}
                          <span className="font-normal text-ws-text">
                            (opsional)
                          </span>
                        </label>
                        <textarea
                          id={`stock-notes-${index}`}
                          name={`notes-${index}`}
                          rows={3}
                          className={`${inputClass} resize-none py-3`}
                        />
                      </div>
                    </fieldset>
                  </details>
                ))}
              </div>
              <p
                role="alert"
                className={
                  error ? "mt-4 text-sm leading-6 text-ws-danger" : "sr-only"
                }
              >
                {error}
              </p>
              {expired ? (
                <Link
                  href="/login"
                  className="mt-2 inline-flex min-h-11 items-center text-sm text-ws-primary underline"
                >
                  Ke halaman masuk
                </Link>
              ) : null}
            </div>
            <footer className="flex shrink-0 flex-wrap items-center justify-end gap-3 border-t border-ws-divider bg-ws-surface px-5 py-4 sm:px-7">
              <button
                type="button"
                disabled={pending}
                onClick={() => dialog.current?.close()}
                className="ws-button-secondary px-4"
              >
                {uncertain ? "Tutup" : "Batal"}
              </button>
              <button
                type="submit"
                disabled={pending || (locations.length === 0 && !uncertain)}
                className={actionClass}
              >
                {pending
                  ? "Menyimpan…"
                  : uncertain
                    ? "Periksa ulang penyimpanan"
                    : "Simpan unit"}
              </button>
            </footer>
          </form>
        )}
      </dialog>
    </StockContext.Provider>
  );
}
