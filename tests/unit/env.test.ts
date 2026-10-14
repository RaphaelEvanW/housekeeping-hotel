import { describe, expect, it } from "vitest";
import { readDatabaseEnv } from "../../src/server/env";

const developmentUrl =
  "postgresql://housekeeping_dev:secret@127.0.0.1:5433/housekeeping_dev";
const testUrl =
  "postgresql://housekeeping_test:secret@127.0.0.1:5434/housekeeping_test";

describe("database environment", () => {
  it("uses DATABASE_URL outside tests", () => {
    expect(readDatabaseEnv({ DATABASE_URL: developmentUrl }).databaseUrl).toBe(
      developmentUrl,
    );
  });

  it.each([undefined, "", "not-a-url", "https://localhost/db", "postgresql://localhost"])(
    "rejects a missing or invalid PostgreSQL URL (%s)",
    (DATABASE_URL) => {
      expect(() => readDatabaseEnv({ DATABASE_URL })).toThrow(/DATABASE_URL/);
    },
  );

  it("does not expose credentials in validation errors", () => {
    const secret = "do-not-print-this-password";
    try {
      readDatabaseEnv({ DATABASE_URL: `https://user:${secret}@localhost/db` });
      expect.fail("Expected invalid protocol to be rejected");
    } catch (error) {
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain("DATABASE_URL");
      expect(String(error)).not.toContain(secret);
    }
  });

  it("selects the isolated test URL in test mode", () => {
    expect(
      readDatabaseEnv({
        NODE_ENV: "test",
        DATABASE_URL: developmentUrl,
        TEST_DATABASE_URL: testUrl,
      }).databaseUrl,
    ).toBe(testUrl);
  });

  it("never falls back to development when TEST_DATABASE_URL is missing", () => {
    expect(() =>
      readDatabaseEnv({ NODE_ENV: "test", DATABASE_URL: developmentUrl }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it.each([
    developmentUrl,
    testUrl.replace("127.0.0.1", "database.example.com"),
    testUrl.replace("/housekeeping_test", "/housekeeping_dev"),
    testUrl.replace("housekeeping_test:secret", "housekeeping_dev:secret"),
    `${testUrl}?host=database.example.com`,
  ])("rejects an unsafe test target", (TEST_DATABASE_URL) => {
    expect(() =>
      readDatabaseEnv({ NODE_ENV: "test", DATABASE_URL: developmentUrl, TEST_DATABASE_URL }),
    ).toThrow(/TEST_DATABASE_URL/);
  });

  it("rejects development and test URLs pointing to the same database with different credentials", () => {
    expect(() =>
      readDatabaseEnv({
        NODE_ENV: "test",
        DATABASE_URL: testUrl.replace("housekeeping_test:secret", "other:different"),
        TEST_DATABASE_URL: testUrl,
      }),
    ).toThrow(/separate/i);
  });
});
