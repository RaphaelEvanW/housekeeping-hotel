import { expect, it } from "vitest";
import { listGuestVisitsInputSchema } from "../../src/server/list-guest-visits-input";

it("defaults to staying visits without coercing absent parameters to zero", () => {
  expect(listGuestVisitsInputSchema.parse({})).toEqual({
    page: 1,
    pageSize: 10,
    q: "",
    status: "STAYING",
  });
});

it("normalizes search and supports all visits", () => {
  expect(
    listGuestVisitsInputSchema.parse({
      page: "2",
      pageSize: "20",
      q: "  TAMU   Pengujian  ",
      status: "ALL",
    }),
  ).toEqual({ page: 2, pageSize: 20, q: "tamu pengujian", status: "ALL" });
});

it.each([
  { page: null },
  { page: 1 },
  { page: "" },
  { page: "0" },
  { page: "1.5" },
  { page: "-1" },
  { page: "1001" },
  { pageSize: "51" },
  { status: "INVALID" },
  { q: "x".repeat(201) },
])("rejects invalid list input %j", (input) => {
  expect(listGuestVisitsInputSchema.safeParse(input).success).toBe(false);
});
