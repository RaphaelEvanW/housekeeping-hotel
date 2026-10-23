import { beforeEach, expect, it, vi } from "vitest";
import { SerializedPrismaPg } from "../../src/server/serialized-prisma-pg";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class { connect() { return mocks.connect(); } } }));

beforeEach(() => vi.clearAllMocks());

it("serializes queryRaw and executeRaw on one transaction", async () => {
  let active = 0;
  let maximum = 0;
  const calls: string[] = [];
  const query = async (label: string) => {
    active++;
    maximum = Math.max(maximum, active);
    calls.push(label);
    await Promise.resolve();
    active--;
  };
  const transaction = {
    queryRaw: vi.fn(async () => { await query("read"); return { columnNames: [], columnTypes: [], rows: [] }; }),
    executeRaw: vi.fn(async () => { await query("write"); return 1; }),
  };
  mocks.connect.mockResolvedValue({ startTransaction: vi.fn(async () => transaction) });
  const connection = await new SerializedPrismaPg({ connectionString: "unused" }).connect();
  const tx = await connection.startTransaction();
  const sql = { sql: "SELECT 1", args: [], argTypes: [] };
  await Promise.all([tx.queryRaw(sql), tx.executeRaw(sql), tx.queryRaw(sql)]);
  expect(maximum).toBe(1);
  expect(calls).toEqual(["read", "write", "read"]);
});

it("keeps rollback queries usable after a failed query", async () => {
  const failed = new Error("query failed");
  const transaction = {
    queryRaw: vi.fn(async () => { throw failed; }),
    executeRaw: vi.fn(async () => 0),
  };
  mocks.connect.mockResolvedValue({ startTransaction: vi.fn(async () => transaction) });
  const connection = await new SerializedPrismaPg({ connectionString: "unused" }).connect();
  const tx = await connection.startTransaction();
  const sql = { sql: "SELECT 1", args: [], argTypes: [] };
  await expect(tx.queryRaw(sql)).rejects.toBe(failed);
  await expect(tx.executeRaw({ ...sql, sql: "ROLLBACK" })).resolves.toBe(0);
});

it("does not serialize separate transaction connections together", async () => {
  let active = 0;
  let maximum = 0;
  mocks.connect.mockResolvedValue({ startTransaction: vi.fn(async () => ({
    queryRaw: async () => {
      active++;
      maximum = Math.max(maximum, active);
      await Promise.resolve();
      active--;
      return { columnNames: [], columnTypes: [], rows: [] };
    },
    executeRaw: async () => 0,
  })) });
  const connection = await new SerializedPrismaPg({ connectionString: "unused" }).connect();
  const first = await connection.startTransaction();
  const second = await connection.startTransaction();
  const sql = { sql: "SELECT 1", args: [], argTypes: [] };
  await Promise.all([first.queryRaw(sql), second.queryRaw(sql)]);
  expect(maximum).toBe(2);
});
