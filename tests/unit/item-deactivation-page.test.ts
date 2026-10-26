import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { isValidElement, type ReactNode } from "react";

import DeactivationPage from "../../src/app/(workspace)/inventory/deactivation-requests/page";
import { listItemDeactivationRequests } from "../../src/server/list-item-deactivation";
import { requireActiveUser } from "../../src/server/require-active-user";
import { listItemDeactivationsInputSchema } from "../../src/server/item-deactivation-input";
import { getItemUnits } from "../../src/server/item-units";

vi.mock("../../src/server/list-item-deactivation", () => ({ listItemDeactivationRequests: vi.fn() }));
vi.mock("../../src/server/require-active-user", () => ({ requireActiveUser: vi.fn() }));
vi.mock("../../src/server/item-units", () => ({ getItemUnits: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string): never => { throw new Error(`REDIRECT:${path}`); },
  useRouter: () => ({ refresh: vi.fn() }),
}));

const list = vi.mocked(listItemDeactivationRequests);
const user = vi.mocked(requireActiveUser);
const itemId = "1c884ffe-af17-42fc-8547-bebfbc6cfba0";

function result() {
  return {
    deactivationRequests: [{
      id: "request-1", status: "PENDING" as const, reason: "Label <lama> sudah diganti.",
      createdAt: new Date("2026-10-23T03:00:00Z"), decidedAt: null,
      item: { id: itemId, name: "Setrika <kamar>", isActive: true },
      requestedBy: { id: "operator", name: "Operator" }, decidedBy: null,
    }],
    pagination: { page: 1, pageSize: 10, total: 11, totalPages: 2, hasNextPage: true },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getItemUnits).mockResolvedValue({ item: { id: itemId, name: "Setrika", isActive: true, description: null, photoUrl: null, photos: [] }, totalRegistered: 0, units: [], nextCursor: null });
  user.mockResolvedValue({ id: "operator", name: "Operator", isActive: true, roles: ["HK_STAFF"] });
  list.mockImplementation(async input => {
    listItemDeactivationsInputSchema.parse(input);
    return result();
  });
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)("allows inventory readers: %s", async role => {
  user.mockResolvedValueOnce({ id: "reader", name: "Reader", isActive: true, roles: [role] });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Pengajuan penonaktifan");
  expect(list).toHaveBeenCalledWith({ page: "1", pageSize: "10", status: "PENDING" });
});

it("does not read data before authentication or authorization", async () => {
  user.mockRejectedValueOnce(new Error("REDIRECT:/login"));
  await expect(DeactivationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/login");
  user.mockResolvedValueOnce({ id: "it", name: "IT", isActive: true, roles: ["SYSTEM_ADMIN"] });
  await expect(DeactivationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/access-denied");
  expect(list).not.toHaveBeenCalled();
  expect(vi.mocked(getItemUnits)).not.toHaveBeenCalled();
});

it("passes raw string pagination to the service instead of parsing twice", async () => {
  await DeactivationPage({ searchParams: Promise.resolve({ page: "2", status: "ALL", itemId }) });
  const input = list.mock.calls[0][0];
  expect(input).toEqual({ page: "2", pageSize: "10", status: "ALL", itemId });
  expect(listItemDeactivationsInputSchema.parse(input)).toEqual({ page: 2, pageSize: 10, status: "ALL", itemId });
});

it.each([{}, { status: "PENDING" }, { status: "REJECTED", itemId }])("resets only applied filters %j", async query => {
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve(query) }));
  expect(html.includes('aria-label="Hapus filter"')).toBe(Boolean(query.status || query.itemId));
  if (query.status || query.itemId) {
    const resetLink = html.match(/<a\b[^>]*aria-label="Hapus filter"[^>]*>/u)?.[0];
    expect(resetLink).toContain('href="/inventory/deactivation-requests"');
  }
});

it.each([{}, { itemId, status: "ALL", page: "2" }])("keeps sibling component keys unique for filter state %j", async query => {
  const tree = await DeactivationPage({ searchParams: Promise.resolve(query) });
  function inspect(node: ReactNode) {
    if (Array.isArray(node)) {
      const keys = node.filter(isValidElement).map(element => element.key).filter(key => key !== null);
      expect(new Set(keys).size).toBe(keys.length);
      node.forEach(inspect);
    } else if (isValidElement<{ children?: ReactNode }>(node)) {
      inspect(node.props.children);
    }
  }
  inspect(tree);
});

it.each([
  { page: "0" }, { page: "1001" }, { page: ["1", "2"] },
  { status: "unknown" }, { status: ["PENDING", "ALL"] },
  { itemId: "invalid" }, { itemId: [itemId, itemId] },
])("rejects invalid filters before querying: %j", async query => {
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve(query) }));
  expect(html).toContain("Filter atau halaman pengajuan tidak valid.");
  expect(list).not.toHaveBeenCalled();
});

it("escapes content and preserves item/status filters in pagination and form", async () => {
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ status: "ALL", itemId }) }));
  expect(list).toHaveBeenCalledWith({ page: "1", pageSize: "10", status: "ALL", itemId });
  expect(html).toContain("Setrika &lt;kamar&gt;");
  expect(html).toContain("Label &lt;lama&gt;");
  expect(html).toContain("Menunggu keputusan");
  expect(html).toContain(`name="itemId" value="${itemId}"`);
  expect(html).toContain(`status=ALL&amp;page=2&amp;itemId=${itemId}`);
  expect(html).toContain("10.00");
  expect(html).toContain("WIB");
  expect(html).toContain('aria-label="Pengajuan sebelumnya"');
  expect(html).toContain('aria-label="Pengajuan berikutnya"');
  expect(html).not.toContain("<select");
  expect(html).not.toContain(">Setujui<");
});

it("shows a named item picker even when the selected item has no requests", async () => {
  list.mockResolvedValueOnce({ deactivationRequests: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0, hasNextPage: false } });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ itemId }) }));
  expect(vi.mocked(getItemUnits)).toHaveBeenCalledWith(itemId);
  expect(html).toContain('id="item-filter-value"');
  expect(html).toContain(">Setrika</span>");
  expect(html).toContain("Jenis barang");
  expect(html).toContain("bg-ws-primary");
});

it("redirects an out-of-range page while retaining the filters", async () => {
  list.mockResolvedValueOnce({ deactivationRequests: [], pagination: { page: 3, pageSize: 10, total: 0, totalPages: 0, hasNextPage: false } });
  await expect(DeactivationPage({ searchParams: Promise.resolve({ page: "3", status: "REJECTED", itemId }) }))
    .rejects.toThrow(`REDIRECT:/inventory/deactivation-requests?status=REJECTED&page=1&itemId=${itemId}`);
});

it("renders genuine empty data and a way to remove the item filter", async () => {
  list.mockResolvedValueOnce({ deactivationRequests: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0, hasNextPage: false } });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ itemId }) }));
  expect(html).toContain("Belum ada pengajuan yang sesuai");
  expect(html).toContain("Semua jenis barang");
  expect(html).toContain("Menampilkan 0–0 dari 0 pengajuan");
});

it("shows recorded decision actors and times", async () => {
  const data = result();
  list.mockResolvedValueOnce({
    ...data,
    deactivationRequests: [{ ...data.deactivationRequests[0], status: "APPROVED", decidedBy: { id: "supervisor", name: "Supervisor" }, decidedAt: new Date("2026-10-23T04:00:00Z") }],
  });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ status: "ALL" }) }));
  expect(html).toContain("Disetujui");
  expect(html).toContain("Supervisor");
  expect(html).toContain("11.00");
});

it("never links beyond the existing page limit", async () => {
  list.mockResolvedValueOnce({ ...result(), pagination: { page: 1000, pageSize: 10, total: 10001, totalPages: 1001, hasNextPage: true } });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ page: "1000" }) }));
  expect(html).not.toContain("page=1001");
  expect(html).toContain("Batas 1000 halaman tercapai");
});

it("propagates load failures to the route error boundary", async () => {
  list.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(DeactivationPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("database unavailable");
});

it.each([
  { role: "HK_STAFF", id: "operator", decide: false, cancel: true },
  { role: "HK_STAFF", id: "other", decide: false, cancel: false },
  { role: "HK_SUPERVISOR", id: "operator", decide: true, cancel: true },
  { role: "HK_SUPERVISOR", id: "other", decide: true, cancel: false },
  { role: "MANAGEMENT", id: "operator", decide: false, cancel: false },
] as const)("shows only allowed pending actions: $role/$id", async ({ role, id, decide, cancel }) => {
  user.mockResolvedValueOnce({ id, name: "Reader", isActive: true, roles: [role] });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({}) }));
  expect(html.includes(">Setujui</button>")).toBe(decide);
  expect(html.includes(">Tolak</button>")).toBe(decide);
  expect(html.includes(">Batalkan</button>")).toBe(cancel);
});

it("does not offer decisions or cancellation for resolved requests", async () => {
  user.mockResolvedValueOnce({ id: "operator", name: "Supervisor", isActive: true, roles: ["HK_SUPERVISOR"] });
  list.mockResolvedValueOnce({ ...result(), deactivationRequests: [{ ...result().deactivationRequests[0], status: "CANCELLED" }] });
  const html = renderToStaticMarkup(await DeactivationPage({ searchParams: Promise.resolve({ status: "ALL" }) }));
  expect(html).not.toContain(">Setujui</button>");
  expect(html).not.toContain(">Batalkan</button>");
});
