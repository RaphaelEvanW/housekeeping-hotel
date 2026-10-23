import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { ItemNameDisclosure } from "../../src/components/item-name-disclosure";

it("shows a long name once with native disclosure for both inventory surfaces", () => {
  const name = "Nama barang panjang ".repeat(8);
  for (const heading of ["h2", "h3"] as const) {
    const html = renderToStaticMarkup(createElement(ItemNameDisclosure, { id: "item-name", name, heading }));
    expect(html.split(name)).toHaveLength(2);
    expect(html).toContain("<details");
    expect(html).toContain("<summary");
    expect(html).toContain("Tampilkan nama lengkap barang");
    expect(html).toContain("group-open:line-clamp-none");
    expect(html).toContain(`<${heading}`);
    expect(html).not.toContain("Selengkapnya");
  }
});

it("keeps a short name visible without an unnecessary disclosure", () => {
  const html = renderToStaticMarkup(createElement(ItemNameDisclosure, { id: "item-name", name: "Hair dryer" }));
  expect(html).toContain('id="item-name"');
  expect(html).toContain("Hair dryer");
  expect(html).not.toContain("<details");
});
