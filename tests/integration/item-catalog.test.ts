import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/items/route";
import { GET as photoGet } from "../../src/app/api/items/[itemId]/photo/route";
import { getActiveUser } from "../../src/server/get-active-user";
import { db } from "../../src/server/db";
import { listItems } from "../../src/server/list-items";
import { getItemUnits } from "../../src/server/item-units";
import { removeItemPhoto } from "../../src/server/item-photo";

vi.mock("../../src/server/get-active-user", () => ({ getActiveUser: vi.fn() }));
const user = vi.mocked(getActiveUser);
let actorId: string;
const storage = join(process.cwd(), ".data", "test-item-photos");
const photo = async () => new File([new Uint8Array(await sharp({ create: { width: 16, height: 12, channels: 3, background: "#904d00" } }).png().toBuffer())], "catalog.png", { type: "image/png" });

function post(form: FormData, origin = "http://localhost:3000") {
  return POST(new Request("http://localhost:3000/api/items", { method: "POST", headers: { Origin: origin }, body: form }));
}
function getPhoto(id: string) { return photoGet(new Request(`http://localhost:3000/api/items/${id}/photo`), { params: Promise.resolve({ itemId: id }) }); }

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  const actor = await db.user.create({ data: { name: "Catalog test", email: `${randomUUID()}@example.test` } });
  actorId = actor.id;
  user.mockResolvedValue({ id: actorId, name: actor.name, isActive: true, roles: ["HK_STAFF"] });
});
afterEach(async () => {
  const items = await db.item.findMany({ where: { createdById: actorId }, select: { photoKey: true } });
  for (const item of items) if (item.photoKey) await removeItemPhoto(item.photoKey);
  await db.auditEvent.deleteMany({ where: { actorId } });
  await db.item.deleteMany({ where: { createdById: actorId } });
  await db.user.delete({ where: { id: actorId } });
  vi.unstubAllEnvs();
});
afterAll(() => db.$disconnect());

it("creates description/photo, audits them, exposes authenticated images and keeps zero physical units", async () => {
  const name = `Catalog ${randomUUID()}`;
  const form = new FormData(); form.set("name", name); form.set("description", "  Pengering rambut kamar tamu.  "); form.set("photo", await photo());
  const response = await post(form);
  expect(response.status).toBe(201);
  const { item } = await response.json();
  expect(item).toMatchObject({ name, description: "Pengering rambut kamar tamu.", photoUrl: `/api/items/${item.id}/photo` });
  expect(item).not.toHaveProperty("photoKey");
  const stored = await db.item.findUniqueOrThrow({ where: { id: item.id } });
  expect(stored.photoKey).toMatch(/^[0-9a-f-]+\.webp$/u);
  const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: item.id, action: "ITEM_CREATED" } });
  expect(audit.newValues).toMatchObject({ description: item.description, photoKey: stored.photoKey });
  expect((await listItems({ page: 1, pageSize: 20, q: name.toLowerCase() })).items[0]).toMatchObject({ description: item.description, photoUrl: item.photoUrl });
  expect(await getItemUnits(item.id)).toMatchObject({ item: { description: item.description, photoUrl: item.photoUrl }, totalRegistered: 0 });
  const image = await getPhoto(item.id);
  expect(image.status).toBe(200);
  expect(image.headers.get("Content-Type")).toBe("image/webp");
  expect(image.headers.get("Cache-Control")).toBe("private, no-store");
  const metadata = await sharp(Buffer.from(await image.arrayBuffer())).metadata();
  expect(metadata).toMatchObject({ format: "webp", width: 16, height: 12 });
  expect(metadata.exif).toBeUndefined();
  user.mockResolvedValueOnce(null); expect((await getPhoto(item.id)).status).toBe(401);
  user.mockResolvedValueOnce({ id: actorId, name: "IT", isActive: true, roles: ["SYSTEM_ADMIN"] }); expect((await getPhoto(item.id)).status).toBe(403);
  user.mockResolvedValueOnce({ id: actorId, name: "Manager", isActive: true, roles: ["MANAGEMENT"] }); expect((await getPhoto(item.id)).status).toBe(200);
});

it("keeps name-only JSON clients compatible", async () => {
  const response = await POST(new Request("http://localhost:3000/api/items", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "application/json" }, body: JSON.stringify({ name: `Legacy ${randomUUID()}` }) }));
  expect(response.status).toBe(201);
  expect((await response.json()).item).toMatchObject({ description: null, photoUrl: null });
});

it("cleans up the newly written photo when duplicate creation rolls back", async () => {
  const name = `Duplicate ${randomUUID()}`;
  let filesBefore: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();form.set("name", name);form.set("photo", await photo());
    expect((await post(form)).status).toBe(attempt === 0 ? 201 : 409);
    if (attempt === 0) filesBefore = await readdir(storage);
  }
  expect((await readdir(storage)).sort()).toEqual(filesBefore.sort());
});

it.each(["svg", "fake-png", "too-big", "description", "duplicate-field", "origin"])("rejects invalid input without creating an item: %s", async kind => {
  const form = new FormData();form.set("name", `Invalid ${randomUUID()}`);
  if (kind === "svg") form.set("photo", new File(["<svg xmlns='http://www.w3.org/2000/svg'/ >"], "x.svg", { type: "image/png" }));
  if (kind === "fake-png") form.set("photo", new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])], "x.png", { type: "image/png" }));
  if (kind === "too-big") form.set("photo", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }));
  if (kind === "description") form.set("description", "x".repeat(2001));
  if (kind === "duplicate-field") form.append("name", "second name");
  expect((await post(form, kind === "origin" ? "http://untrusted.test" : undefined)).status).toBe(kind === "origin" ? 403 : 400);
  expect(await db.item.count({ where: { createdById: actorId } })).toBe(0);
});

it("enforces multipart stream limit and permission before processing uploads", async () => {
  // Raw stream avoids Node's FormData File producer enqueueing after cancellation.
  const largeRequest = new Request("http://localhost:3000/api/items", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "multipart/form-data; boundary=large" }, body: new Uint8Array(3 * 1024 * 1024) });
  expect((await POST(largeRequest)).status).toBe(413);
  const form = new FormData();form.set("name", "Unauthorized");form.set("photo", await photo());
  user.mockResolvedValueOnce(null);expect((await post(form)).status).toBe(401);
  user.mockResolvedValueOnce({ id: actorId, name: "Manager", isActive: true, roles: ["MANAGEMENT"] });expect((await post(form)).status).toBe(403);
  expect((await getPhoto(randomUUID())).status).toBe(404);
});
