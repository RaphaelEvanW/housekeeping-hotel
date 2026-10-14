import { z } from "zod";

type Environment = Record<string, string | undefined>;

const postgresUrl = z.string().min(1).refine((value) => {
  try {
    const url = new URL(value);
    return (
      ["postgresql:", "postgres:"].includes(url.protocol) &&
      url.hostname.length > 0 &&
      /^\/[^/]+$/.test(decodeURIComponent(url.pathname)) &&
      !url.hash
    );
  } catch {
    return false;
  }
});

function parseUrl(value: string | undefined, name: string) {
  const result = postgresUrl.safeParse(value);
  if (!result.success) {
    throw new Error(`${name} must be a valid PostgreSQL URL with an explicit database name.`);
  }
  return result.data;
}

function databaseTarget(url: URL) {
  const host = ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)
    ? "loopback"
    : url.hostname;
  return `${host}:${url.port || "5432"}${decodeURIComponent(url.pathname)}`;
}

export function readDatabaseEnv(source: Environment) {
  const databaseUrl = parseUrl(source.DATABASE_URL, "DATABASE_URL");
  if (source.NODE_ENV !== "test") return { databaseUrl };

  const testUrl = parseUrl(source.TEST_DATABASE_URL, "TEST_DATABASE_URL");
  const target = new URL(testUrl);
  if (
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.pathname !== "/housekeeping_test" ||
    target.username !== "housekeeping_test" ||
    target.search
  ) {
    throw new Error(
      "TEST_DATABASE_URL must use a loopback host, housekeeping_test database/user, and no query parameters.",
    );
  }
  if (databaseTarget(target) === databaseTarget(new URL(databaseUrl))) {
    throw new Error("TEST_DATABASE_URL and DATABASE_URL must target separate databases.");
  }
  return { databaseUrl: testUrl };
}
