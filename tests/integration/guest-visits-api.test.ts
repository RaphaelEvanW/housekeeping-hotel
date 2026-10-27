import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeEach, expect, it, vi } from "vitest";
import { GET as LIST_GUEST_VISITS, POST } from "../../src/app/api/guest-visits/route";
import { GET, PATCH } from "../../src/app/api/guest-visits/[visitId]/route";
import { POST as CHECKOUT } from "../../src/app/api/guest-visits/[visitId]/checkout/route";
import { db } from "../../src/server/db";
import { getActiveUser } from "../../src/server/get-active-user";

vi.mock("../../src/server/get-active-user", () => ({ getActiveUser: vi.fn() }));
const activeUser = vi.mocked(getActiveUser);
type Actor = NonNullable<Awaited<ReturnType<typeof getActiveUser>>>;
let actor: Actor;
let input: {
  requestId: string;
  primaryGuestName: string;
  roomNumber: string;
  bookingNumber: string;
  checkInDate: string;
  plannedCheckoutDate: string;
};

function post(body: unknown, headers: Record<string, string> = {}) {
  return POST(
    new Request("http://localhost/api/guest-visits", {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
  );
}
function get(id: string) {
  return GET(new Request(`http://localhost/api/guest-visits/${id}`), {
    params: Promise.resolve({ visitId: id }),
  });
}
function checkout(id: string, body: unknown = {}, headers: Record<string, string> = {}) {
  return CHECKOUT(
    new Request(`http://localhost/api/guest-visits/${id}/checkout`, {
      method: "POST",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ visitId: id }) },
  );
}
function patchVisit(
  id: string,
  body: unknown,
  headers: Record<string, string> = {},
) {
  return PATCH(
    new Request(`http://localhost/api/guest-visits/${id}`, {
      method: "PATCH",
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    }),
    { params: Promise.resolve({ visitId: id }) },
  );
}
function listVisits(query: Record<string, string> = {}) {
  return LIST_GUEST_VISITS(new Request(
    `http://localhost/api/guest-visits?${new URLSearchParams(query)}`,
  ));
}
async function counts(visits: number) {
  expect(await db.guestVisit.count({ where: { createdById: actor.id } })).toBe(
    visits,
  );
  expect(
    await db.auditEvent.count({
      where: { actorId: actor.id, action: "GUEST_VISIT_REGISTERED" },
    }),
  ).toBe(visits);
}

beforeEach(async () => {
  vi.stubEnv("BETTER_AUTH_URL", "http://localhost:3000");
  vi.stubEnv("BETTER_AUTH_TRUSTED_ORIGINS", "http://localhost:3000");
  activeUser.mockReset();
  const user = await db.user.create({
    data: {
      name: "Guest registration test",
      email: `${randomUUID()}@example.test`,
    },
  });
  actor = { id: user.id, name: user.name, isActive: true, roles: ["HK_STAFF"] };
  activeUser.mockResolvedValue(actor);
  input = {
    requestId: randomUUID(),
    primaryGuestName: `Test ${randomUUID()}`,
    roomNumber: "A-101",
    bookingNumber: "TEST-001",
    checkInDate: "2026-10-26",
    plannedCheckoutDate: "2026-10-28",
  };
});
afterEach(async () => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  await db.$transaction([
    db.auditEvent.deleteMany({ where: { actorId: actor.id } }),
    db.guestVisit.deleteMany({ where: { createdById: actor.id } }),
    db.user.delete({ where: { id: actor.id } }),
  ]);
});
afterAll(() => db.$disconnect());

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "registers a stay with manual booking and audit as %s",
  async (role) => {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    const response = await post(input);
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toMatchObject({
      visit: {
        id: input.requestId,
        bookingNumber: "TEST-001",
        status: "STAYING",
        isDuplicate: false,
      },
      replayed: false,
    });
    const read = await get(input.requestId);
    expect(read.status).toBe(200);
    const body = await read.json();
    expect(body.visit).toMatchObject({
      primaryGuestName: input.primaryGuestName,
      checkInDate: "2026-10-26T00:00:00.000Z",
      checkedOutAt: null,
    });
    expect(body.visit).not.toHaveProperty("registrationRequestHash");
    expect(
      await db.auditEvent.findFirstOrThrow({
        where: { entityId: input.requestId, action: "GUEST_VISIT_REGISTERED" },
      }),
    ).toMatchObject({
      actorId: actor.id,
      newValues: { bookingNumber: "TEST-001", status: "STAYING" },
    });
    await counts(1);
  },
);

it("replays without duplicates, rejects changed payload/actor, and preserves registration identity after later corrections", async () => {
  expect((await post(input)).status).toBe(201);
  expect((await post(input)).status).toBe(200);
  expect((await post({ ...input, bookingNumber: "CHANGED" })).status).toBe(409);
  activeUser.mockResolvedValue({ ...actor, id: randomUUID() });
  expect((await post(input)).status).toBe(409);
  activeUser.mockResolvedValue(actor);
  await db.guestVisit.update({
    where: { id: input.requestId },
    data: {
      roomNumber: "A-102",
      status: "CHECKED_OUT",
      checkedOutAt: new Date(),
    },
  });
  expect((await post(input)).status).toBe(200);
  expect(
    (await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } }))
      .roomNumber,
  ).toBe("A-102");
  await counts(1);
});

it("warns about overlap, requires an override reason and flags only exact duplicates", async () => {
  expect((await post(input)).status).toBe(201);
  const second = {
    ...input,
    requestId: randomUUID(),
    primaryGuestName: `  ${input.primaryGuestName.toUpperCase()}  `,
    roomNumber: "a-101",
  };
  const warning = await post(second);
  expect(warning.status).toBe(409);
  expect(await warning.json()).toMatchObject({
    error: "POSSIBLE_DUPLICATE",
    matchingVisitId: input.requestId,
  });
  await counts(1);
  expect(
    (
      await post({
        ...second,
        duplicateOverrideReason:
          "Kunjungan dicatat terpisah setelah konfirmasi.",
      })
    ).status,
  ).toBe(201);
  expect(
    (await db.guestVisit.findUniqueOrThrow({ where: { id: second.requestId } }))
      .isDuplicate,
  ).toBe(true);
  const event = await db.auditEvent.findFirstOrThrow({
    where: { entityId: second.requestId },
  });
  expect(event).toMatchObject({
    reason: "Kunjungan dicatat terpisah setelah konfirmasi.",
    newValues: { isDuplicate: true },
  });
  const overlapping = {
    ...input,
    requestId: randomUUID(),
    plannedCheckoutDate: "2026-10-29",
    duplicateOverrideReason: "Tanggal sudah dikonfirmasi.",
  };
  expect((await post(overlapping)).status).toBe(201);
  expect(
    (
      await db.guestVisit.findUniqueOrThrow({
        where: { id: overlapping.requestId },
      })
    ).isDuplicate,
  ).toBe(false);
  await counts(3);
});

it("allows a separate stay without merging identity or inferring checkout from planned dates", async () => {
  const past = {
    ...input,
    checkInDate: "2020-01-01",
    plannedCheckoutDate: "2020-01-02",
  };
  expect((await post(past)).status).toBe(201);
  expect(
    (await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } }))
      .status,
  ).toBe("STAYING");
  expect((await post({ ...input, requestId: randomUUID() })).status).toBe(201);
  await counts(2);
});

it("compares room numbers literally and ignores checked-out candidates", async () => {
  expect((await post(input)).status).toBe(201);
  expect(
    (await post({ ...input, requestId: randomUUID(), roomNumber: "A%" }))
      .status,
  ).toBe(201);
  await db.guestVisit.update({
    where: { id: input.requestId },
    data: { status: "CHECKED_OUT", checkedOutAt: new Date() },
  });
  expect((await post({ ...input, requestId: randomUUID() })).status).toBe(201);
  await counts(3);
});

it("serializes concurrent duplicate detection and concurrent retries", async () => {
  const same = await Promise.all([post(input), post(input), post(input)]);
  expect(same.map((response) => response.status).sort()).toEqual([
    200, 200, 201,
  ]);
  await counts(1);
  const duplicate = await Promise.all([
    post({ ...input, requestId: randomUUID() }),
    post({ ...input, requestId: randomUUID() }),
  ]);
  expect(duplicate.map((response) => response.status)).toEqual([409, 409]);
  await counts(1);
});

it("allows only one simultaneous first registration without an override", async () => {
  const results = await Promise.all([
    post(input),
    post({ ...input, requestId: randomUUID() }),
  ]);
  expect(results.map((response) => response.status).sort()).toEqual([201, 409]);
  await counts(1);
});

it.each(["MANAGEMENT", "SYSTEM_ADMIN"] as const)(
  "denies registration to %s",
  async (role) => {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await post(input)).status).toBe(403);
    await counts(0);
  },
);

it("enforces read access, authentication, origin, body limits and validation", async () => {
  activeUser.mockResolvedValue(null);
  expect((await post(input)).status).toBe(401);
  expect((await get(input.requestId)).status).toBe(401);
  activeUser.mockResolvedValue(actor);
  expect((await post(input, { Origin: "https://untrusted.test" })).status).toBe(
    403,
  );
  expect((await post(input, { "Content-Type": "text/plain" })).status).toBe(
    415,
  );
  expect((await post({ ...input, extra: "x".repeat(256 * 1024) })).status).toBe(
    413,
  );
  expect((await post({ ...input, bookingNumber: " " })).status).toBe(400);
  expect((await post({ ...input, isDuplicate: true })).status).toBe(400);
  expect(
    (
      await POST(
        new Request("http://localhost/api/guest-visits", {
          method: "POST",
          headers: {
            Origin: "http://localhost:3000",
            "Content-Type": "application/json",
          },
          body: "{",
        }),
      )
    ).status,
  ).toBe(400);
  expect((await get("invalid")).status).toBe(400);
  expect((await get(randomUUID())).status).toBe(404);
  await counts(0);
  expect((await post(input)).status).toBe(201);
  activeUser.mockResolvedValue({ ...actor, roles: ["MANAGEMENT"] });
  expect((await get(input.requestId)).status).toBe(200);
  activeUser.mockResolvedValue({ ...actor, roles: ["SYSTEM_ADMIN"] });
  expect((await get(input.requestId)).status).toBe(403);
});

it("rolls back a registration if its audit fails", async () => {
  const failure = new Error("Audit unavailable");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(async (tx) => {
      const failingTransaction = new Proxy(tx, {
        get(target, key) {
          if (key === "auditEvent") {
            return new Proxy(target.auditEvent, {
              get(delegate, action) {
                if (action === "create")
                  return async () => {
                    throw failure;
                  };
                return Reflect.get(delegate, action);
              },
            });
          }
          return Reflect.get(target, key);
        },
      });
      return callback(failingTransaction);
    }, options),
  );
  await expect(post(input)).rejects.toBe(failure);
  await counts(0);
});

it("lists real visits with stay filters, literal search and stable pagination", async () => {
  const token = input.requestId;
  const ids: string[] = [];
  for (let index = 0; index < 3; index++) {
    const id = randomUUID();
    ids.push(id);
    expect((await post({
      ...input, requestId: id,
      primaryGuestName: `Daftar ${token} ${index}`,
      roomNumber: `R-${token.slice(0, 24)}-${index}`,
      bookingNumber: `BOOK-${token}-${index}`,
    })).status).toBe(201);
  }
  await db.guestVisit.update({ where: { id: ids[2] }, data: {
    status: "CHECKED_OUT", checkedOutAt: new Date(),
  } });

  const staying = await listVisits({ q: token });
  expect(staying.status).toBe(200);
  expect(staying.headers.get("Cache-Control")).toBe("no-store");
  expect(await staying.json()).toMatchObject({
    pagination: { total: 2, pageSize: 10, totalPages: 1, hasNextPage: false },
  });

  const query = { q: token, status: "ALL", pageSize: "2" };
  const first = await (await listVisits(query)).json();
  const second = await (await listVisits({ ...query, page: "2" })).json();
  expect(first.visits).toHaveLength(2);
  expect(second.visits).toHaveLength(1);
  expect(first.pagination).toMatchObject({ total: 3, totalPages: 2, hasNextPage: true });
  expect(second.pagination.hasNextPage).toBe(false);
  const returnedIds = [...first.visits, ...second.visits].map((visit: { id: string }) => visit.id);
  expect(new Set(returnedIds)).toEqual(new Set(ids));
  expect((await (await listVisits(query)).json()).visits).toEqual(first.visits);
  for (const visit of first.visits) expect(visit).not.toHaveProperty("registrationRequestHash");

  const beyond = await (await listVisits({ ...query, page: "3" })).json();
  expect(beyond).toMatchObject({ visits: [], pagination: { total: 3, totalPages: 2, hasNextPage: false } });
  const checkedOut = await (await listVisits({ q: token, status: "CHECKED_OUT" })).json();
  expect(checkedOut.visits).toHaveLength(1);
  expect(checkedOut.visits[0].id).toBe(ids[2]);

  for (const search of [`R-${token.slice(0, 24)}-0`, `book-${token}-0`]) {
    const result = await (await listVisits({ q: search, status: "ALL" })).json();
    expect(result.visits.map((visit: { id: string }) => visit.id)).toEqual([ids[0]]);
  }
  const names = await (await listVisits({ q: `DAFTAR ${token.toUpperCase()}`, status: "ALL" })).json();
  expect(names.pagination.total).toBe(3);
});

it("escapes wildcard search characters instead of broadening the guest list", async () => {
  const token = input.requestId;
  const literalId = randomUUID();
  expect((await post({ ...input, requestId: literalId, primaryGuestName: `Literal ${token}%_` })).status).toBe(201);
  expect((await post({ ...input, requestId: randomUUID(), primaryGuestName: `Literal ${token}XY` })).status).toBe(201);
  const result = await (await listVisits({ q: `${token}%_` })).json();
  expect(result.visits.map((visit: { id: string }) => visit.id)).toEqual([literalId]);
});

it("validates list parameters and enforces read permissions", async () => {
  for (const role of ["HK_STAFF", "HK_SUPERVISOR", "MANAGEMENT"] as const) {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await listVisits({ q: input.requestId })).status).toBe(200);
  }
  activeUser.mockResolvedValue(actor);
  const invalidQueries: Record<string, string>[] = [
    { page: "0" }, { page: "1.5" }, { pageSize: "51" },
    { status: "INVALID" }, { q: "x".repeat(201) },
  ];
  for (const query of invalidQueries) {
    const response = await listVisits(query);
    expect(response.status).toBe(400);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  }
  const empty = await (await listVisits({ q: `absent-${input.requestId}` })).json();
  expect(empty).toMatchObject({ visits: [], pagination: { total: 0, totalPages: 0, hasNextPage: false } });
  activeUser.mockResolvedValue({ ...actor, roles: ["SYSTEM_ADMIN"] });
  expect((await listVisits()).status).toBe(403);
  activeUser.mockResolvedValue(null);
  expect((await listVisits()).status).toBe(401);
});

it.each(["HK_STAFF", "HK_SUPERVISOR"] as const)(
  "checks out a visit with server timestamp and one audit as %s",
  async (role) => {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await post(input)).status).toBe(201);
    const before = Date.now();
    const response = await checkout(input.requestId);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    const result = await response.json();
    expect(result).toMatchObject({
      visit: { id: input.requestId, status: "CHECKED_OUT" },
      outstandingLines: 0,
      alreadyCheckedOut: false,
    });
    const timestamp = Date.parse(result.visit.checkedOutAt);
    expect(timestamp).toBeGreaterThanOrEqual(before);
    expect(timestamp).toBeLessThanOrEqual(Date.now());
    expect(result.visit).not.toHaveProperty("registrationRequestHash");

    const retry = await checkout(input.requestId);
    expect(retry.status).toBe(200);
    expect(await retry.json()).toMatchObject({
      visit: { checkedOutAt: result.visit.checkedOutAt },
      alreadyCheckedOut: true,
    });
    expect(await db.auditEvent.count({
      where: { entityId: input.requestId, action: "GUEST_VISIT_CHECKED_OUT" },
    })).toBe(1);
    expect(await db.auditEvent.findFirstOrThrow({
      where: { entityId: input.requestId, action: "GUEST_VISIT_CHECKED_OUT" },
    })).toMatchObject({
      actorId: actor.id,
      oldValues: { status: "STAYING", checkedOutAt: null },
      newValues: { status: "CHECKED_OUT", outstandingLines: 0 },
    });
    expect(await (await get(input.requestId)).json()).toMatchObject({ visit: { status: "CHECKED_OUT" } });
    expect(await (await post(input)).json()).toMatchObject({ visit: { status: "CHECKED_OUT" }, replayed: true });
  },
);

it("serializes concurrent checkout retries without duplicate audit or timestamp", async () => {
  expect((await post(input)).status).toBe(201);
  const responses = await Promise.all([checkout(input.requestId), checkout(input.requestId)]);
  expect(responses.map((response) => response.status)).toEqual([200, 200]);
  const results = await Promise.all(responses.map((response) => response.json()));
  expect(results.map((result) => result.alreadyCheckedOut).sort()).toEqual([false, true]);
  expect(results[0].visit.checkedOutAt).toBe(results[1].visit.checkedOutAt);
  expect(await db.auditEvent.count({
    where: { entityId: input.requestId, action: "GUEST_VISIT_CHECKED_OUT" },
  })).toBe(1);
});

it("rejects unauthorized checkout, invalid input, untrusted origins and oversized bodies", async () => {
  expect((await post(input)).status).toBe(201);
  for (const role of ["MANAGEMENT", "SYSTEM_ADMIN"] as const) {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await checkout(input.requestId)).status).toBe(403);
  }
  activeUser.mockResolvedValue(null);
  expect((await checkout(input.requestId)).status).toBe(401);
  activeUser.mockResolvedValue(actor);
  expect((await checkout("invalid")).status).toBe(400);
  expect((await checkout(randomUUID())).status).toBe(404);
  expect((await checkout(input.requestId, { acknowledgeOutstanding: "true" })).status).toBe(400);
  expect((await checkout(input.requestId, { checkedOutAt: new Date().toISOString() })).status).toBe(400);
  expect((await checkout(input.requestId, {}, { Origin: "https://untrusted.test" })).status).toBe(403);
  expect((await checkout(input.requestId, {}, { "Content-Type": "text/plain" })).status).toBe(415);
  expect((await checkout(input.requestId, { extra: "x".repeat(256 * 1024) })).status).toBe(413);
  expect(await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } })).toMatchObject({
    status: "STAYING", checkedOutAt: null,
  });
});

it("rolls checkout back when its audit cannot be saved", async () => {
  expect((await post(input)).status).toBe(201);
  const failure = new Error("Audit unavailable");
  const originalTransaction = db.$transaction.bind(db);
  vi.spyOn(db, "$transaction").mockImplementationOnce((callback, options) =>
    originalTransaction(async (tx) => {
      const failingTransaction = new Proxy(tx, {
        get(target, key) {
          if (key === "auditEvent") {
            return new Proxy(target.auditEvent, {
              get(delegate, action) {
                if (action === "create") return async () => { throw failure; };
                return Reflect.get(delegate, action);
              },
            });
          }
          return Reflect.get(target, key);
        },
      });
      return callback(failingTransaction);
    }, options),
  );
  await expect(checkout(input.requestId)).rejects.toBe(failure);
  expect(await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } })).toMatchObject({
    status: "STAYING", checkedOutAt: null,
  });
  expect(await db.auditEvent.count({
    where: { entityId: input.requestId, action: "GUEST_VISIT_CHECKED_OUT" },
  })).toBe(0);
});

it("corrects the primary guest or room with reason, audit, and registration replay intact", async () => {
  expect((await post(input)).status).toBe(201);
  const before = await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } });
  const response = await patchVisit(input.requestId, {
    expectedUpdatedAt: before.updatedAt.toISOString(),
    primaryGuestName: "Corrected Primary Guest",
    roomNumber: "A-102",
    reason: "Dikonfirmasi ulang dengan kartu registrasi.",
  });
  expect(response.status).toBe(200);
  expect(await response.json()).toMatchObject({
    visit: { primaryGuestName: "Corrected Primary Guest", roomNumber: "A-102" },
    unchanged: false,
  });
  expect((await post(input)).status).toBe(200);
  expect(await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } })).toMatchObject({
    primaryGuestName: "Corrected Primary Guest",
    roomNumber: "A-102",
  });
  expect(await db.auditEvent.count({ where: { entityId: input.requestId, action: "GUEST_VISIT_UPDATED" } })).toBe(1);
  expect(await db.auditEvent.findFirstOrThrow({ where: { entityId: input.requestId, action: "GUEST_VISIT_UPDATED" } })).toMatchObject({
    actorId: actor.id,
    reason: "Dikonfirmasi ulang dengan kartu registrasi.",
    oldValues: { primaryGuestName: input.primaryGuestName, roomNumber: "A-101" },
    newValues: { primaryGuestName: "Corrected Primary Guest", roomNumber: "A-102" },
  });
});

it("rejects stale guest visit edits and requires acknowledgement for a possible duplicate", async () => {
  expect((await post(input)).status).toBe(201);
  const before = await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } });
  const secondInput = {
    ...input,
    requestId: randomUUID(),
    primaryGuestName: `Other ${randomUUID()}`,
  };
  expect((await post(secondInput)).status).toBe(201);
  const duplicateBody = {
    expectedUpdatedAt: before.updatedAt.toISOString(),
    primaryGuestName: secondInput.primaryGuestName,
    roomNumber: secondInput.roomNumber,
    reason: "Koreksi nama berdasarkan konfirmasi tamu.",
  };
  const duplicate = await patchVisit(input.requestId, duplicateBody);
  expect(duplicate.status).toBe(409);
  expect(await duplicate.json()).toMatchObject({ error: "POSSIBLE_DUPLICATE", matchingVisitId: secondInput.requestId });
  expect((await patchVisit(input.requestId, { ...duplicateBody, acknowledgeDuplicate: true })).status).toBe(200);

  const updated = await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } });
  expect((await patchVisit(input.requestId, {
    expectedUpdatedAt: updated.updatedAt.toISOString(),
    primaryGuestName: `Unique ${randomUUID()}`,
    reason: "Perbaikan nama untuk uji konkurensi.",
  })).status).toBe(200);
  const concurrencyBase = await db.guestVisit.findUniqueOrThrow({ where: { id: input.requestId } });
  const concurrent = await Promise.all([
    patchVisit(input.requestId, { expectedUpdatedAt: concurrencyBase.updatedAt.toISOString(), roomNumber: "A-103", reason: "Koreksi kamar." }),
    patchVisit(input.requestId, { expectedUpdatedAt: concurrencyBase.updatedAt.toISOString(), roomNumber: "A-104", reason: "Koreksi kamar." }),
  ]);
  expect(concurrent.map((response) => response.status).sort()).toEqual([200, 409]);
});

it("rejects unauthorized and malformed guest visit corrections", async () => {
  expect((await post(input)).status).toBe(201);
  for (const role of ["MANAGEMENT", "SYSTEM_ADMIN"] as const) {
    activeUser.mockResolvedValue({ ...actor, roles: [role] });
    expect((await patchVisit(input.requestId, {})).status).toBe(403);
  }
  activeUser.mockResolvedValue(actor);
  const validCorrection = {
    expectedUpdatedAt: new Date().toISOString(),
    roomNumber: "A-102",
    reason: "Koreksi kamar.",
  };
  expect((await patchVisit("invalid", validCorrection)).status).toBe(400);
  expect((await patchVisit(randomUUID(), validCorrection)).status).toBe(404);
  expect((await patchVisit(input.requestId, { roomNumber: "A-102" })).status).toBe(400);
  expect((await patchVisit(input.requestId, { roomNumber: "A-102" }, { Origin: "https://untrusted.test" })).status).toBe(403);
  expect((await patchVisit(input.requestId, { roomNumber: "A-102" }, { "Content-Type": "text/plain" })).status).toBe(415);
  expect((await patchVisit(input.requestId, { payload: "x".repeat(256 * 1024) })).status).toBe(413);
});
