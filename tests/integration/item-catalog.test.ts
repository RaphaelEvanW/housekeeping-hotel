import { randomUUID } from "node:crypto";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";
import type { Prisma } from "../../src/generated/prisma/client";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { POST } from "../../src/app/api/items/route";
import { GET as photoGet } from "../../src/app/api/items/[itemId]/photo/route";
import { GET as galleryPhotoGet } from "../../src/app/api/items/[itemId]/photos/[photoId]/route";
import { getActiveUser } from "../../src/server/get-active-user";
import { db } from "../../src/server/db";
import { listItems } from "../../src/server/list-items";
import { getItemUnits } from "../../src/server/item-units";
import { removeItemPhoto } from "../../src/server/item-photo";
import * as itemPhotos from "../../src/server/item-photo";

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
  vi.restoreAllMocks();
  const items = await db.item.findMany({ where: { createdById: actorId }, select: { photoKey: true, photos: { select: { photoKey: true } } } });
  for (const item of items) for (const key of new Set([item.photoKey, ...item.photos.map(photo => photo.photoKey)])) if (key) await removeItemPhoto(key);
  await db.itemPhoto.deleteMany({ where: { item: { createdById: actorId } } });
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
  expect((await response.json()).item).toMatchObject({ description: null, photoUrl: null, photos: [] });
});

it("persists every catalog photo in selection order and serves only photos of the requested item", async () => {
  const name = `Gallery ${randomUUID()}`;
  const form = new FormData();
  form.set("name", name);
  form.append("photo", await photo());
  const second = await sharp({ create: { width: 9, height: 7, channels: 3, background: "#131b2e" } }).png().toBuffer();
  form.append("photo", new File([new Uint8Array(second)], "second.png", { type: "image/png" }));
  const response = await post(form);
  expect(response.status).toBe(201);
  const { item } = await response.json();
  expect(item.photos).toHaveLength(2);
  expect(item.photos.map((entry: { position: number }) => entry.position)).toEqual([0, 1]);
  const stored = await db.itemPhoto.findMany({ where: { itemId: item.id }, orderBy: { position: "asc" } });
  expect(stored).toHaveLength(2);
  expect(new Set(stored.map(entry => entry.photoKey)).size).toBe(2);
  const audit = await db.auditEvent.findFirstOrThrow({ where: { entityId: item.id, action: "ITEM_CREATED" } });
  expect(audit.newValues).toMatchObject({ photoIds: stored.map(entry => entry.id), photoKeys: stored.map(entry => entry.photoKey) });
  expect(JSON.stringify(item)).not.toContain(stored[0].photoKey);
  for (const [index, entry] of item.photos.entries()) {
    expect(entry.url).toBe(`/api/items/${item.id}/photos/${entry.id}`);
    const image = await galleryPhotoGet(new Request(`http://localhost:3000${entry.url}`), { params: Promise.resolve({ itemId: item.id, photoId: entry.id }) });
    expect(image.status).toBe(200);
    expect(image.headers.get("Cache-Control")).toBe("private, no-store");
    expect(await sharp(Buffer.from(await image.arrayBuffer())).metadata()).toMatchObject(index === 0 ? { width: 16, height: 12 } : { width: 9, height: 7 });
  }
  expect((await listItems({ page: 1, pageSize: 20, q: name.toLowerCase() })).items[0].photos).toEqual(item.photos);
  expect((await getItemUnits(item.id))?.item.photos).toEqual(item.photos);
  const cover = await getPhoto(item.id);
  expect(await sharp(Buffer.from(await cover.arrayBuffer())).metadata()).toMatchObject({ width: 16, height: 12 });
  const context = { params: Promise.resolve({ itemId: item.id, photoId: item.photos[1].id }) };
  const request = () => new Request(`http://localhost:3000${item.photos[1].url}`);
  user.mockResolvedValueOnce(null);
  expect((await galleryPhotoGet(request(), context)).status).toBe(401);
  user.mockResolvedValueOnce({ id: actorId, name: "IT", isActive: true, roles: ["SYSTEM_ADMIN"] });
  expect((await galleryPhotoGet(request(), context)).status).toBe(403);
  user.mockResolvedValueOnce({ id: actorId, name: "Manager", isActive: true, roles: ["MANAGEMENT"] });
  expect((await galleryPhotoGet(request(), context)).status).toBe(200);
  expect((await galleryPhotoGet(request(), { params: Promise.resolve({ itemId: randomUUID(), photoId: item.photos[1].id }) })).status).toBe(404);
  await removeItemPhoto(stored[1].photoKey);
  expect((await galleryPhotoGet(request(), context)).status).toBe(404);
});

it("rejects the whole creation if a later photo is invalid or the photo count exceeds the limit", async () => {
  const invalid = new FormData(); invalid.set("name", `Invalid gallery ${randomUUID()}`);
  invalid.append("photo", await photo());
  invalid.append("photo", new File(["not an image"], "bad.png", { type: "image/png" }));
  expect((await post(invalid)).status).toBe(400);
  const excessive = new FormData(); excessive.set("name", `Large gallery ${randomUUID()}`);
  const file = await photo();
  for (let i = 0; i < 11; i++) excessive.append("photo", file);
  expect((await post(excessive)).status).toBe(400);
  expect(await db.item.count({ where: { createdById: actorId } })).toBe(0);
  expect(await db.itemPhoto.count({ where: { item: { createdById: actorId } } })).toBe(0);
});

it("accepts ten catalog photos and uses the first as the cover", async () => {
  const form = new FormData(); form.set("name", `Ten photos ${randomUUID()}`);
  const file = await photo();
  for (let i = 0; i < 10; i++) form.append("photo", file);
  const response = await post(form);
  expect(response.status).toBe(201);
  const { item } = await response.json();
  expect(item.photos).toHaveLength(10);
  const stored = await db.itemPhoto.findFirstOrThrow({ where: { itemId: item.id }, orderBy: { position: "asc" } });
  expect(await db.item.findUniqueOrThrow({ where: { id: item.id } })).toMatchObject({ photoKey: stored.photoKey });
});

it("removes earlier staged files if storing a later photo fails", async () => {
  const store = itemPhotos.storeItemPhoto;
  const keys: string[] = [];
  vi.spyOn(itemPhotos, "storeItemPhoto").mockImplementation(async bytes => {
    if (keys.length === 1) throw new Error("Simulated storage failure");
    const key = await store(bytes);
    keys.push(key);
    return key;
  });
  const form = new FormData(); form.set("name", `Storage failure ${randomUUID()}`);
  form.append("photo", await photo()); form.append("photo", await photo());
  await expect(post(form)).rejects.toThrow("Simulated storage failure");
  expect(keys).toHaveLength(1);
  await expect(itemPhotos.readItemPhoto(keys[0])).rejects.toMatchObject({ code: "ENOENT" });
  expect(await db.item.count({ where: { createdById: actorId } })).toBe(0);
  expect(await db.auditEvent.count({ where: { actorId } })).toBe(0);
});

it("rolls back the entire catalog gallery and cleans files when photo metadata cannot be saved", async () => {
  const prepared = await itemPhotos.prepareItemPhoto(await photo());
  const key = await itemPhotos.storeItemPhoto(prepared);
  vi.spyOn(itemPhotos, "storeItemPhoto").mockResolvedValue(key);
  try {
    const form = new FormData(); form.set("name", `Metadata failure ${randomUUID()}`);
    form.append("photo", await photo()); form.append("photo", await photo());
    await expect(post(form)).rejects.toThrow();
    expect(await db.item.count({ where: { createdById: actorId } })).toBe(0);
    expect(await db.itemPhoto.count({ where: { item: { createdById: actorId } } })).toBe(0);
    expect(await db.auditEvent.count({ where: { actorId } })).toBe(0);
    await expect(itemPhotos.readItemPhoto(key)).rejects.toMatchObject({ code: "ENOENT" });
  } finally {
    await removeItemPhoto(key);
  }
});

it("preserves committed photos when the transaction result is lost", async () => {
  const transact = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce(async (callback: unknown) => {
    if (typeof callback !== "function") throw new Error("Expected interactive transaction");
    await transact(callback as (tx: Prisma.TransactionClient) => Promise<unknown>);
    throw new Error("Simulated lost transaction response");
  });
  const form = new FormData(); form.set("name", `Uncertain result ${randomUUID()}`);
  form.append("photo", await photo()); form.append("photo", await photo());
  await expect(post(form)).rejects.toThrow("Simulated lost transaction response");
  const saved = await db.item.findFirstOrThrow({ where: { createdById: actorId }, include: { photos: true } });
  expect(saved.photos).toHaveLength(2);
  for (const entry of saved.photos) expect((await itemPhotos.readItemPhoto(entry.photoKey)).length).toBeGreaterThan(0);
  expect((await getPhoto(saved.id)).status).toBe(200);
});

it("cleans up the newly written photo when duplicate creation rolls back", async () => {
  const name = `Duplicate ${randomUUID()}`;
  let filesBefore: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const form = new FormData();form.set("name", name);form.append("photo", await photo());form.append("photo", await photo());
    expect((await post(form)).status).toBe(attempt === 0 ? 201 : 409);
    if (attempt === 0) filesBefore = await readdir(storage);
  }
  expect((await readdir(storage)).sort()).toEqual(filesBefore.sort());
});

it.each(["svg", "fake-png", "too-big", "description", "duplicate-field", "duplicate-description", "photo-text", "unknown-field", "origin"])("rejects invalid input without creating an item: %s", async kind => {
  const form = new FormData();form.set("name", `Invalid ${randomUUID()}`);
  if (kind === "svg") form.set("photo", new File(["<svg xmlns='http://www.w3.org/2000/svg'/ >"], "x.svg", { type: "image/png" }));
  if (kind === "fake-png") form.set("photo", new File([new Uint8Array([137,80,78,71,13,10,26,10,0,0])], "x.png", { type: "image/png" }));
  if (kind === "too-big") form.set("photo", new File([new Uint8Array(2 * 1024 * 1024 + 1)], "x.png", { type: "image/png" }));
  if (kind === "description") form.set("description", "x".repeat(2001));
  if (kind === "duplicate-field") form.append("name", "second name");
  if (kind === "duplicate-description") { form.append("description", "one"); form.append("description", "two"); }
  if (kind === "photo-text") form.append("photo", "not-a-file");
  if (kind === "unknown-field") form.append("photoKey", "browser-controlled.webp");
  expect((await post(form, kind === "origin" ? "http://untrusted.test" : undefined)).status).toBe(kind === "origin" ? 403 : 400);
  expect(await db.item.count({ where: { createdById: actorId } })).toBe(0);
});

it("enforces multipart stream limit and permission before processing uploads", async () => {
  // Raw stream avoids Node's FormData File producer enqueueing after cancellation.
  const largeRequest = new Request("http://localhost:3000/api/items", { method: "POST", headers: { Origin: "http://localhost:3000", "Content-Type": "multipart/form-data; boundary=large" }, body: new Uint8Array(16 * 1024 * 1024 + 1) });
  expect((await POST(largeRequest)).status).toBe(413);
  const form = new FormData();form.set("name", "Unauthorized");form.set("photo", await photo());
  user.mockResolvedValueOnce(null);expect((await post(form)).status).toBe(401);
  user.mockResolvedValueOnce({ id: actorId, name: "Manager", isActive: true, roles: ["MANAGEMENT"] });expect((await post(form)).status).toBe(403);
  expect((await getPhoto(randomUUID())).status).toBe(404);
});
