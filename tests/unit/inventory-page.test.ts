import { beforeEach, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

import InventoryPage from "../../src/app/(workspace)/inventory/page";
import { getItemUnits } from "../../src/server/item-units";
import { listItems } from "../../src/server/list-items";
import { requireActiveUser } from "../../src/server/require-active-user";
import { getStockLocations } from "../../src/server/stock-locations";

vi.mock("../../src/server/item-units", () => ({ getItemUnits: vi.fn() }));
vi.mock("../../src/server/list-items", () => ({ listItems: vi.fn() }));
vi.mock("../../src/server/require-active-user", () => ({ requireActiveUser: vi.fn() }));
vi.mock("../../src/server/stock-locations", () => ({ getStockLocations: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: (path: string): never => { throw new Error(`REDIRECT:${path}`); },
  useRouter: () => ({ replace: vi.fn() }),
}));

const mockList = vi.mocked(listItems);
const mockUnits = vi.mocked(getItemUnits);
const mockUser = vi.mocked(requireActiveUser);
const mockLocations = vi.mocked(getStockLocations);
const itemId = "1c884ffe-af17-42fc-8547-bebfbc6cfba0";

beforeEach(() => {
  vi.clearAllMocks();
  mockUser.mockResolvedValue({ id: "actor", name: "Operator", isActive: true, roles: ["HK_STAFF"] });
  mockLocations.mockResolvedValue([{ id: "69c4960b-a275-4c67-a384-57331403c677", name: "Gudang aktif" }]);
  mockList.mockResolvedValue({
    items: [],
    pagination: { page: 1, pageSize: 20, total: 0, totalPages: 0, hasNextPage: false },
  });
  mockUnits.mockResolvedValue({
    item: { id: itemId, name: "Setrika", isActive: false, description: null, photoUrl: null },
    totalRegistered: 0, units: [], nextCursor: null,
  });
});

it("does not read inventory when the active-user guard redirects", async () => {
  mockUser.mockRejectedValueOnce(new Error("REDIRECT:/login"));
  await expect(InventoryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("REDIRECT:/login");
  expect(mockList).not.toHaveBeenCalled();
  expect(mockUnits).not.toHaveBeenCalled();
  expect(mockLocations).not.toHaveBeenCalled();
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)("exposes item creation only to an authorized role: %s", async role => {
  mockUser.mockResolvedValueOnce({ id: "actor", name: "Operator", isActive: true, roles: [role] });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({}) }));
  expect(html.includes('id="create-item-name"')).toBe(role !== "MANAGEMENT");
  expect(html.includes('id="stock-quantity"')).toBe(role !== "MANAGEMENT");
  expect(mockLocations).toHaveBeenCalledTimes(role === "MANAGEMENT" ? 0 : 1);
  if (role !== "MANAGEMENT") {
    expect(html).toContain("belum menambahkan stok atau unit fisik");
    expect(html).toContain('maxLength="100"');
  }
});

it("rejects a role without inventory read permission before data access", async () => {
  mockUser.mockResolvedValueOnce({ id: "it", name: "IT", isActive: true, roles: ["SYSTEM_ADMIN"] });
  await expect(InventoryPage({ searchParams: Promise.resolve({ item: itemId }) })).rejects.toThrow("REDIRECT:/access-denied");
  expect(mockList).not.toHaveBeenCalled();
  expect(mockUnits).not.toHaveBeenCalled();
});

it.each([
  { page: "0" }, { page: "1001" }, { page: "abc" }, { page: ["1", "2"] },
  { q: "x".repeat(101) }, { q: ["a", "b"] }, { item: "invalid" },
  { item: [itemId, itemId] }, { after: "1" }, { item: itemId, after: "0" },
  { item: itemId, after: "2147483648" }, { item: itemId, after: ["1", "2"] },
])("rejects malformed query %j before any database query", async (query) => {
  await InventoryPage({ searchParams: Promise.resolve(query) });
  expect(mockList).not.toHaveBeenCalled();
  expect(mockUnits).not.toHaveBeenCalled();
});

it("normalizes search and uses bounded pagination without querying unselected units", async () => {
  await InventoryPage({ searchParams: Promise.resolve({ q: "  HAIR   dryer  " }) });
  expect(mockList).toHaveBeenCalledWith({ q: "hair dryer", page: 1, pageSize: 20 });
  expect(mockUnits).not.toHaveBeenCalled();
});

it("passes a valid item and bounded cursor to the existing unit service", async () => {
  await InventoryPage({ searchParams: Promise.resolve({ item: itemId, after: "2147483647" }) });
  expect(mockUnits).toHaveBeenCalledWith(itemId, 2147483647);
});

it("keeps inactive item unit history accessible to read-only Management", async () => {
  mockUser.mockResolvedValueOnce({ id: "manager", name: "Management", isActive: true, roles: ["MANAGEMENT"] });
  await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) });
  expect(mockUnits).toHaveBeenCalledWith(itemId, undefined);
});

it("handles a missing selected item without assuming a unit exists", async () => {
  mockUnits.mockResolvedValueOnce(null);
  await expect(InventoryPage({ searchParams: Promise.resolve({ item: itemId }) })).resolves.toBeDefined();
});

it("redirects out-of-range list pages to page one while preserving the normalized search", async () => {
  await expect(InventoryPage({ searchParams: Promise.resolve({ q: "  SETRIKA ", page: "2" }) })).rejects.toThrow("REDIRECT:/inventory?q=setrika&page=1");
});

it("propagates unexpected data failures to the route error boundary", async () => {
  mockList.mockRejectedValueOnce(new Error("database unavailable"));
  await expect(InventoryPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("database unavailable");
});

it("renders stored names safely and keeps the selected-item action and dates readable", async () => {
  mockList.mockResolvedValueOnce({
    items: [{ id: itemId, name: "Setrika <script>", isActive: true, description: null, photoUrl: null, createdAt: new Date("2026-10-21T00:00:00Z"), updatedAt: new Date("2026-10-21T00:00:00Z") }],
    pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false },
  });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({}) }));
  expect(html).toContain("Setrika &lt;script&gt;");
  expect(html).not.toContain("<script>");
  expect(html).toContain(`item=${itemId}`);
  expect(html).toContain("Detail barang");
  expect(html).toContain("21 Okt 2026");
});

it("renders lifecycle, custody, physical condition, readiness and loss as separate facts", async () => {
  mockUnits.mockResolvedValueOnce({
    item: { id: itemId, name: "Setrika", isActive: false, description: null, photoUrl: null },
    totalRegistered: 1, nextCursor: null,
    units: [{
      id: "unit-id", unitNumber: 125, unitCode: "HK-000125",
      serialNumber: null, notes: null, lifecycle: "RETIRED", custody: "GUEST",
      condition: "GOOD", readiness: "CLEAR", lossState: "LOST", location: null,
      createdAt: new Date("2026-10-21T00:00:00Z"), updatedAt: new Date("2026-10-21T00:00:00Z"),
    }],
  });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) }));
  expect(html).toContain("Penguasaan: Tamu");
  expect(html).toContain("Kondisi: Baik");
  expect(html).toContain("Kesiapan: Tanpa penahanan");
  expect(html).toContain("Siklus unit: Dipensiunkan");
  expect(html).toContain("Hilang");
  expect(html).not.toContain(">Siap dipinjam<");
});

it("renders actual catalog photo/description and stock controls for an active item", async () => {
  const item = { id: itemId, name: "Hair dryer", isActive: true, description: "Pengering <kamar>", photoUrl: `/api/items/${itemId}/photo` };
  mockList.mockResolvedValueOnce({ items: [{ ...item, createdAt: new Date(), updatedAt: new Date() }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false } });
  mockUnits.mockResolvedValueOnce({ item, totalRegistered: 0, units: [], nextCursor: null });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) }));
  expect(html).toContain(`src="/api/items/${itemId}/photo"`);
  expect(html).not.toContain("/_next/image");
  expect(html).toContain("Pengering &lt;kamar&gt;");
  expect(html.match(/aria-label="Tambah stok Hair dryer"/gu)).toHaveLength(3);
});

it("does not offer Add Stock for an inactive item", async () => {
  const item = { id: itemId, name: "Setrika", isActive: false, description: null, photoUrl: null };
  mockList.mockResolvedValueOnce({ items: [{ ...item, createdAt: new Date(), updatedAt: new Date() }], pagination: { page: 1, pageSize: 20, total: 1, totalPages: 1, hasNextPage: false } });
  mockUnits.mockResolvedValueOnce({ item, totalRegistered: 0, units: [], nextCursor: null });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) }));
  expect(html).not.toContain('aria-label="Tambah stok Setrika"');
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)("offers audited rename only to an allowed role, including inactive items: %s", async role => {
  mockUser.mockResolvedValueOnce({ id: "actor", name: "Operator", isActive: true, roles: [role] });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) }));
  expect(html.includes('aria-label="Edit jenis barang"')).toBe(role !== "MANAGEMENT");
  expect(html).not.toContain('id="edit-item-name"');
});

it("keeps the empty unit table below the registered count and labelled stock action", async () => {
  const name = "Barang panjang ".repeat(12);
  mockUnits.mockResolvedValueOnce({ item: { id: itemId, name, isActive: true, description: null, photoUrl: null }, totalRegistered: 0, units: [], nextCursor: null });
  const html = renderToStaticMarkup(await InventoryPage({ searchParams: Promise.resolve({ item: itemId }) }));
  const panel = html.slice(html.indexOf('id="inventory-unit-panel"'));
  expect(panel.indexOf("Unit fisik terdaftar")).toBeLessThan(panel.indexOf('aria-label="Tambah stok'));
  expect(panel.indexOf('aria-label="Tambah stok')).toBeLessThan(panel.indexOf("<table"));
  expect(panel.indexOf('aria-label="Tambah stok')).toBeLessThan(panel.indexOf('aria-label="Edit jenis barang"'));
  expect(panel.indexOf('aria-label="Edit jenis barang"')).toBeLessThan(panel.indexOf("<table"));
  expect(panel).toContain('colSpan="2"');
  expect(panel).toContain("Belum ada unit fisik untuk jenis barang ini.");
  expect(panel).toContain("Selengkapnya");
  expect(panel).not.toContain("Nama lengkap barang");
  expect(panel).not.toContain("Jumlah terdaftar bukan jumlah siap dipinjam");
  expect(panel).not.toContain("Setiap kode di daftar ini");
});
