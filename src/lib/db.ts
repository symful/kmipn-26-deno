import { Client } from "pg";
import type { Env } from "@/types/bindings";
import { logger } from "@/lib/logger";

export type PgClient = Client;

export async function withClient<T>(
  env: Env,
  fn: (client: Client) => Promise<T>,
): Promise<T> {
  const isWorker = typeof caches !== "undefined" && typeof fetch !== "undefined";
  const connectionString = isWorker
    ? env.HYPERDRIVE.connectionString
    : env.POSTGRESQL_URI;

  const url = new URL(connectionString);
  const password = url.password ? decodeURIComponent(url.password) : "";

  const client = new Client({
    host: url.hostname,
    port: url.port ? parseInt(url.port, 10) : 5432,
    database: url.pathname.replace(/^\//, "") || undefined,
    user: url.username || undefined,
    password: async () => password,
  });
  try {
    await client.connect();
    return await fn(client);
  } finally {
    await client.end();
  }
}

export async function pingDb(env: Env): Promise<boolean> {
  try {
    await withClient(env, async (c) => {
      await c.query("SELECT 1");
    });
    return true;
  } catch (err) {
    logger.error({ route: "/health", method: "GET", error: err instanceof Error ? err : new Error(String(err)) });
    return false;
  }
}
