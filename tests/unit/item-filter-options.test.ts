import { expect, it } from "vitest";
import { parseItemFilterOptions } from "../../src/lib/item-filter-options";

const body = {
  items: [{ id: "11111111-1111-4111-8111-111111111111", name: "Barang lama", isActive: false }],
  pagination: { page: 1, pageSize: 10 as const, total: 53, totalPages: 6, hasNextPage: true },
};

it("supports paginated catalogs larger than one page and inactive items", () => {
  expect(parseItemFilterOptions(body, 1)?.items[0].isActive).toBe(false);
  expect(parseItemFilterOptions(body, 1)?.pagination.totalPages).toBe(6);
});

it("rejects invalid pages and response shapes instead of choosing the wrong item", () => {
  expect(parseItemFilterOptions(body, 2)).toBeNull();
  expect(parseItemFilterOptions({ ...body, items: [{ id: "bad", name: "Item", isActive: true }] }, 1)).toBeNull();
  expect(parseItemFilterOptions({ ...body, pagination: { ...body.pagination, hasNextPage: false } }, 1)).toBeNull();
});

it("accepts an empty search result", () => {
  expect(parseItemFilterOptions({ items: [], pagination: { page: 1, pageSize: 10, total: 0, totalPages: 0, hasNextPage: false } }, 1)).not.toBeNull();
});
