import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { StatusFilter } from "../../src/app/(workspace)/inventory/deactivation-requests/status-filter";

it("submits the current status and exposes named choices through the shared popup", () => {
  const html = renderToStaticMarkup(createElement(StatusFilter, {
    initialValue: "REJECTED",
    options: [{ value: "PENDING", label: "Menunggu keputusan" }, { value: "REJECTED", label: "Ditolak" }],
  }));
  expect(html).toContain('name="status" value="REJECTED"');
  expect(html).toContain('id="deactivation-status-value"');
  expect(html).toContain('aria-label="Pilihan status pengajuan"');
  expect(html).toContain("Menunggu keputusan");
  expect(html).toContain("Dipilih");
  expect(html).not.toContain("<select");
  expect(html).not.toContain('name="search"');
});
