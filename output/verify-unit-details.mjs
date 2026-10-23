import fs from "node:fs";
import assert from "node:assert/strict";
import { build } from "esbuild";
import { compile } from "@tailwindcss/node";
import { Scanner } from "@tailwindcss/oxide";
import { chromium } from "file:///C:/Users/user/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const unit = {
  id: "b7edcb7a-8515-409d-92e5-478ff82e539d", itemId: "1c884ffe-af17-42fc-8547-bebfbc6cfba0", unitCode: "HK-000125", name: null, serialNumber: "HD-125", notes: "Label lama.",
  createdAt: "2026-10-20T00:00:00.000Z", updatedAt: "2026-10-21T00:00:00.000Z",
  facts: [{ label: "Kondisi unit", value: "Baik" }, { label: "Kesiapan", value: "Tanpa penahanan" }, { label: "Penguasaan", value: "Housekeeping" }, { label: "Lokasi", value: "Gudang HK" }, { label: "Siklus unit", value: "Aktif" }, { label: "Status kehilangan", value: "Tidak ada laporan" }],
};
const bundle = await build({
  stdin: { contents: `import React from "react";import{createRoot}from "react-dom/client";import{UnitDetailsDialog}from "./src/app/(workspace)/inventory/unit-details-dialog";import{InventoryDrawer}from "./src/app/(workspace)/inventory/inventory-drawer";createRoot(document.getElementById("root")).render(React.createElement(InventoryDrawer,{closeHref:"/inventory"},React.createElement("h2",{id:"units-heading"},"Hair dryer"),React.createElement(UnitDetailsDialog,{unit:${JSON.stringify(unit)},itemName:"Hair dryer",canEdit:!location.search.includes("readonly")})));`, resolveDir: process.cwd(), loader: "tsx" },
  bundle: true, write: false, platform: "browser", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "fixture-router", setup(builder) { builder.onResolve({ filter: /^next\/navigation$/ }, () => ({ path: "router", namespace: "fixture" })); builder.onLoad({ filter: /.*/, namespace: "fixture" }, () => ({ contents: "const router={refresh(){window.refreshCount=(window.refreshCount||0)+1},replace(){window.replaceCount=(window.replaceCount||0)+1}};export const useRouter=()=>router;" })); } }],
});
const compiler = await compile(fs.readFileSync("src/app/globals.css", "utf8"), { base: `${process.cwd()}/src/app`, onDependency() {} });
const scanner = new Scanner({ sources: [{ base: process.cwd(), pattern: "src/**/*.{tsx,css}", negated: false }] });
const css = compiler.build(scanner.scan());
const html = `<html lang="id"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css}</style><body><main id="root" style="padding:24px"></main><script>${bundle.outputFiles[0].text}</script></body></html>`;
const browser = await chromium.launch({ channel: "msedge", headless: true });
let assertions = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); assertions++; }
try {
  const context = await browser.newContext({ reducedMotion: "reduce" });
  let mode = "success", calls = [], release;
  await context.route("**/*", async route => {
    const request = route.request();
    if (request.url().startsWith("http://housekeeping.test/api/item-units/")) {
      const payload = request.postDataJSON(); calls.push(payload);
      if (mode === "pending") await new Promise(resolve => { release = resolve; });
      if (mode === "network") return route.abort();
      const status = typeof mode === "number" ? mode : 200;
      return route.fulfill({ status, contentType: "application/json", body: JSON.stringify(status === 200 ? { unit: { ...unit, ...payload, id: mode === "mismatch" ? "wrong-unit" : unit.id, updatedAt: "2026-10-23T01:00:00.000Z" } } : { error: "TEST_REJECTION" }) });
    }
    if (request.url().startsWith("http://housekeeping.test/")) return route.fulfill({ contentType: "text/html", body: html });
    return route.abort();
  });
  const page = await context.newPage();
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  const details = () => page.locator('dialog[aria-labelledby^="unit-details-"]');
  async function open(edit = false) {
    await page.getByRole("button", { name: /^Detail unit / }).click();
    await details().waitFor();
    if (edit) await page.getByRole("button", { name: "Edit unit HK-000125", exact: true }).click();
  }
  for (const width of [320, 390, 1366, 1440]) {
    await page.setViewportSize({ width, height: 820 });
    await page.goto("http://housekeeping.test/");
    await open();
    check(await details().getByText("Gudang HK", { exact: true }).count(), 1);
    check(await details().getByText("Tanpa penahanan", { exact: true }).count(), 1);
    check(await details().evaluate(el => el.scrollWidth <= el.clientWidth), true);
    await page.screenshot({ path: `output/playwright/unit-details-${width}.png` });
    await page.getByRole("button", { name: "Edit unit HK-000125", exact: true }).click();
    check(await page.getByLabel("Nomor seri (opsional)").inputValue(), "HD-125");
    check(await page.getByLabel("Deskripsi (opsional)").inputValue(), "Label lama.");
    check(await details().locator("select").count(), 0);
    await page.getByLabel("Nomor seri (opsional)").fill("  HD-NEW  ");
    await page.getByLabel("Deskripsi (opsional)").fill("   ");
    await page.screenshot({ path: `output/playwright/unit-edit-${width}.png` });
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByRole("status").filter({ hasText: "Unit berhasil diperbarui." }).waitFor();
    check(calls.at(-1), { serialNumber: "HD-NEW", notes: null });
    check(await details().locator("dd").getByText("HD-NEW", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Tutup detail unit" }).click();
    check(await page.getByRole("button", { name: /^Detail unit / }).evaluate(el => el === document.activeElement), true);
    check(await page.locator("#inventory-unit-panel").evaluate(el => el.open), true);
    await open();
    check(await details().locator("dd").getByText("HD-NEW", { exact: true }).count(), 1);
    await page.getByRole("button", { name: "Tutup detail unit" }).click();
  }
  await page.goto("http://housekeeping.test/"); await open(true);
  await page.getByLabel("Nomor seri (opsional)").fill("");
  await page.getByLabel("Deskripsi (opsional)").fill("  Deskripsi baru.  ");
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Unit berhasil diperbarui." }).waitFor();
  check(calls.at(-1), { serialNumber: null, notes: "Deskripsi baru." });
  await page.goto("http://housekeeping.test/"); await open(true);
  await page.getByLabel("Deskripsi (opsional)").fill("x".repeat(270000));
  const beforeOversize = calls.length;
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("alert").filter({ hasText: "Data terlalu besar" }).waitFor();
  check(calls.length, beforeOversize);
  for (const status of [400, 401, 403, 404, 413, 415]) {
    mode = status;
    await page.goto("http://housekeeping.test/"); await open(true);
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByRole("alert").waitFor();
    check(await page.getByRole("button", { name: "Simpan", exact: true }).isEnabled(), true);
    check(await page.getByRole("status").textContent(), "");
    if (status === 401) check(await page.getByRole("link", { name: "Ke halaman masuk" }).getAttribute("href"), "/login");
  }
  for (const failure of ["network", "mismatch", 500]) {
    mode = failure;
    await page.goto("http://housekeeping.test/"); await open(true);
    await page.getByLabel("Nomor seri (opsional)").fill("ATTEMPTED");
    await page.getByRole("button", { name: "Simpan", exact: true }).click();
    await page.getByRole("button", { name: "Muat ulang data" }).waitFor();
    check(await page.getByLabel("Nomor seri (opsional)").isDisabled(), true);
    const before = calls.length;
    await page.getByRole("button", { name: "Tutup detail unit" }).click(); await open();
    check(await page.getByLabel("Nomor seri (opsional)").inputValue(), "ATTEMPTED");
    check(await page.getByRole("button", { name: "Muat ulang data" }).count(), 1);
    check(calls.length, before);
  }
  mode = "pending";
  await page.setViewportSize({ width: 390, height: 820 });
  await page.goto("http://housekeeping.test/"); await open(true);
  const before = calls.length;
  await page.getByRole("button", { name: "Simpan", exact: true }).click();
  await page.getByRole("button", { name: "Menyimpan…" }).waitFor();
  await details().locator("form").evaluate(form => form.requestSubmit());
  await page.keyboard.press("Escape");
  check(await page.getByRole("button", { name: "Tutup detail unit" }).isDisabled(), true);
  check(await details().evaluate(el => el.open), true);
  check(calls.length, before + 1);
  release();
  await page.getByRole("status").filter({ hasText: "Unit berhasil diperbarui." }).waitFor();
  await page.goto("http://housekeeping.test/?readonly"); await open();
  check(await page.getByRole("button", { name: "Edit unit HK-000125", exact: true }).count(), 0);
  check(await details().locator("dd").getByText("HD-125", { exact: true }).count(), 1);
  await page.keyboard.press("Escape");
  check(await details().count(), 0);
  check(await page.locator("#inventory-unit-panel").evaluate(el => el.open), true);
  check(await page.evaluate(() => window.replaceCount || 0), 0);
  check(errors, []);
  console.log(`Passed ${assertions} isolated browser assertions on actual UnitDetailsDialog (mocked router/API, zero dev writes).`);
} finally { await browser.close(); }
