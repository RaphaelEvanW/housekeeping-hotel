async page => {
  let checks = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  function check(value, message) { if (!value) throw new Error(message); checks++; }
  async function visibleWithinViewport(locator) {
    const box = await locator.boundingBox();
    const viewport = page.viewportSize();
    return box && box.y >= 0 && box.y + box.height <= viewport.height + 1 && box.x >= 0 && box.x + box.width <= viewport.width + 1;
  }
  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }, { width: 390, height: 844 }, { width: 320, height: 568 }]) {
    await page.setViewportSize(viewport);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("http://127.0.0.1:4319/");
    const panel = page.locator("#inventory-unit-panel[open]");
    await panel.waitFor();
    check(await panel.locator("tbody tr").count() === 50, "actual page must render the 50-unit cursor page");
    const footer = panel.locator("[data-drawer-footer]");
    const action = footer.getByRole("button", { name: "Ajukan penonaktifan", exact: true });
    check(await visibleWithinViewport(action), "deactivation must remain visible at every viewport");
    const list = panel.getByRole("region", { name: "Daftar unit fisik", exact: true });
    const dimensions = await list.evaluate(el => ({ client: el.clientHeight, scroll: el.scrollHeight }));
    check(dimensions.scroll > dimensions.client, "50 units should overflow the inner list");
    check(dimensions.client <= viewport.height * 0.4 + 1, "unit list exceeds bounded viewport height");
    const before = await footer.boundingBox();
    await list.evaluate(el => { el.scrollTop = el.scrollHeight; });
    await panel.locator("[data-drawer-body]").evaluate(el => { el.scrollTop = el.scrollHeight; });
    check(await visibleWithinViewport(action), "deactivation sank after scrolling");
    const after = await footer.boundingBox();
    check(Math.abs(before.y - after.y) < 1, "footer must not move with scroll");
    check((await panel.getByRole("link", { name: "Unit berikutnya", exact: true }).getAttribute("href")).includes("after=50"), "cursor link changed");
    await list.evaluate(el => { el.scrollTop = 0; });
    await panel.locator("[data-drawer-body]").evaluate(el => { el.scrollTop = 0; });
    const alignment = await panel.locator("tbody tr").first().evaluate(row => {
      const top = el => { const range = document.createRange(); range.selectNodeContents(el); return range.getBoundingClientRect().top; };
      return [top(row.cells[0]), top(row.cells[1].querySelector("button > span")), top(row.cells[2].querySelector("p"))];
    });
    check(Math.max(...alignment) - Math.min(...alignment) <= 3, "No/name/status first lines are misaligned: " + alignment.join(","));
    check((await panel.locator("tbody tr").first().textContent()).includes("Tidak ada pembatasan"), "readiness copy missing");
    check(!(await panel.textContent()).includes("Tanpa penahanan"), "old readiness text remains");
    await action.click();
    await page.getByRole("heading", { name: "Pengajuan penonaktifan", exact: true }).waitFor();
    await page.getByRole("button", { name: "Tutup pengajuan penonaktifan", exact: true }).click();
    check(await panel.isVisible(), "closing child modal also closed parent");
    if (viewport.width === 1440 || viewport.width === 390) await panel.screenshot({ path: `output/drawer-layout-${viewport.width}.png` });
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("http://127.0.0.1:4319/?long=1");
  const longPanel = page.locator("#inventory-unit-panel[open]");
  await longPanel.waitFor();
  check(await visibleWithinViewport(longPanel.getByRole("button", { name: "Ajukan penonaktifan", exact: true })), "long metadata hid the footer");
  await longPanel.locator("[data-drawer-body]").evaluate(el => { el.scrollTop = el.scrollHeight; });
  check(await visibleWithinViewport(longPanel.getByRole("button", { name: "Ajukan penonaktifan", exact: true })), "long metadata scroll hid footer");
  await longPanel.screenshot({ path: "output/drawer-layout-long.png" });
  await page.goto("http://127.0.0.1:4319/?empty=1");
  const empty = page.locator("#inventory-unit-panel[open]");
  await empty.waitFor();
  check((await empty.textContent()).includes("Belum ada unit fisik"), "empty state missing");
  check(await visibleWithinViewport(empty.getByRole("button", { name: "Ajukan penonaktifan", exact: true })), "empty state hid actions");
  await page.goto("http://127.0.0.1:4319/?readonly=1");
  const readonly = page.locator("#inventory-unit-panel[open]");
  await readonly.waitFor();
  check(await readonly.getByRole("button", { name: "Ajukan penonaktifan", exact: true }).count() === 0, "Management must not request deactivation");
  check(await readonly.getByRole("button", { name: "Edit jenis barang", exact: true }).count() === 0, "Management must not edit");
  check(await readonly.getByRole("link", { name: "Riwayat pengajuan", exact: true }).isVisible(), "Management lost history access");
  check(errors.length === 0, "browser exceptions: " + errors.join("; "));
  return { checks, browserErrors: errors.length, fixture: "actual InventoryPage/InventoryDrawer compiled with Tailwind; mocked read services/router, no DB writes" };
}
