import { randomUUID } from "node:crypto";
import sharp from "sharp";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";

import { GET } from "../../src/app/api/item-units/[unitId]/photos/[photoId]/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";
import { getItemUnitHistory } from "../../src/server/item-unit-history";
import {
  prepareUnitPhoto,
  removeUnitPhoto,
  storeUnitPhoto,
} from "../../src/server/unit-photo";

vi.mock("../../src/server/get-active-user", () => ({
  getActiveUser: vi.fn(),
}));

const user = vi.mocked(getActiveUser);

let actorId: string | undefined;
let unitId: string;
let photoId: string;
let photoKey: string;
const storedKeys: string[] = [];

function getPhoto(targetUnit = unitId, targetPhoto = photoId) {
  return GET(
    new Request(
      `http://localhost:3000/api/item-units/${targetUnit}/photos/${targetPhoto}`,
    ),
    {
      params: Promise.resolve({
        unitId: targetUnit,
        photoId: targetPhoto,
      }),
    },
  );
}

beforeEach(async () => {
  actorId = undefined;
  user.mockReset();

  const actor = await db.user.create({
    data: {
      name: "Photo evidence test",
      email: `${randomUUID()}@example.test`,
    },
  });
  actorId = actor.id;

  user.mockResolvedValue({
    id: actor.id,
    name: actor.name,
    isActive: true,
    roles: ["HK_STAFF"],
  });

  const name = `Photo evidence ${randomUUID()}`;
  const item = await db.item.create({
    data: {
      name,
      normalizedName: name.toLowerCase(),
      createdById: actor.id,
      updatedById: actor.id,
    },
  });

  const unit = await db.itemUnit.create({
    data: {
      itemId: item.id,
      createdById: actor.id,
      updatedById: actor.id,
    },
  });
  unitId = unit.id;

  const event = await db.auditEvent.create({
    data: {
      actorId: actor.id,
      action: "STOCK_UNIT_CREATED",
      entityType: "ITEM_UNIT",
      entityId: unit.id,
    },
  });

  const bytes = await sharp({
    create: {
      width: 16,
      height: 12,
      channels: 3,
      background: "#131B2E",
    },
  }).png().toBuffer();

  const prepared = await prepareUnitPhoto(
    new File([new Uint8Array(bytes)], "unit.png", {
      type: "image/png",
    }),
  );

  photoKey = await storeUnitPhoto(prepared);
  storedKeys.push(photoKey);

  const photo = await db.itemUnitPhoto.create({
    data: {
      unitId,
      auditEventId: event.id,
      photoKey,
    },
  });
  photoId = photo.id;
});

afterEach(async () => {
  try {
    if (!actorId) return;

    await db.itemUnitPhoto.deleteMany({
      where: { unit: { createdById: actorId } },
    });
    await db.auditEvent.deleteMany({ where: { actorId } });
    await db.itemUnit.deleteMany({ where: { createdById: actorId } });
    await db.item.deleteMany({ where: { createdById: actorId } });
    await db.user.delete({ where: { id: actorId } });
  } finally {
    await Promise.all(storedKeys.splice(0).map(removeUnitPhoto));
    actorId = undefined;
    user.mockReset();
  }
});

afterAll(() => db.$disconnect());

it("requires an authorized inventory reader", async () => {
  user.mockResolvedValueOnce(null);
  expect((await getPhoto()).status).toBe(401);

  if (!actorId) throw new Error("Missing fixture actor");
  user.mockResolvedValueOnce({
    id: actorId,
    name: "IT",
    isActive: true,
    roles: ["SYSTEM_ADMIN"],
  });
  expect((await getPhoto()).status).toBe(403);
});

it.each(["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const)(
  "serves private WebP to %s",
  async role => {
    if (!actorId) throw new Error("Missing fixture actor");
    user.mockResolvedValueOnce({
      id: actorId,
      name: "Reader",
      isActive: true,
      roles: [role],
    });

    const response = await getPhoto();

    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(response.headers.get("Content-Type")).toBe("image/webp");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");

    const bytes = Buffer.from(await response.arrayBuffer());
    expect((await sharp(bytes).metadata()).format).toBe("webp");
  },
);

it("rejects invalid IDs, missing photos and another unit's URL", async () => {
  expect((await getPhoto("invalid")).status).toBe(404);
  expect((await getPhoto(unitId, randomUUID())).status).toBe(404);
  expect((await getPhoto(randomUUID(), photoId)).status).toBe(404);
});

it("rejects a mismatched audit event", async () => {
  if (!actorId) throw new Error("Missing fixture actor");

  const event = await db.auditEvent.create({
    data: {
      actorId,
      action: "ITEM_UPDATED",
      entityType: "ITEM",
      entityId: randomUUID(),
    },
  });

  await db.itemUnitPhoto.update({
    where: { id: photoId },
    data: { auditEventId: event.id },
  });

  expect((await getPhoto()).status).toBe(404);
});

it("returns 404 for a missing file without deleting its evidence record", async () => {
  await removeUnitPhoto(photoKey);

  expect((await getPhoto()).status).toBe(404);
  expect(
    await db.itemUnitPhoto.findUnique({ where: { id: photoId } }),
  ).not.toBeNull();
});

it("includes private photo URLs in history without exposing storage keys", async () => {
  const history = await getItemUnitHistory({ unitId });

  expect(history?.events[0].photos).toEqual([
    {
      id: photoId,
      url: `/api/item-units/${unitId}/photos/${photoId}`,
    },
  ]);
  expect(JSON.stringify(history)).not.toContain(photoKey);
});