import { createClient } from "redis";

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value || value.trim().length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value.trim();
}

export type RedisClient = ReturnType<typeof createClient>;

let client: RedisClient | null = null;
let connectPromise: Promise<void> | null = null;

function getClient(): RedisClient {
  if (client) return client;

  const url = getRequiredEnv("PAPERCLIP_REDIS_URL");
  client = createClient({ url });

  client.on("error", (err) => {
    // Intentionally do not throw here; callers should handle cache misses gracefully.
    // We keep the connection-level errors visible in logs.
    // eslint-disable-next-line no-console
    console.error("[redis] client error", err);
  });

  return client;
}

async function ensureConnected(): Promise<void> {
  const c = getClient();
  if (c.isReady) return;
  if (!connectPromise) {
    connectPromise = c.connect().then(() => {});
  }
  await connectPromise;
}

export async function getJson<T>(key: string): Promise<T | null> {
  await ensureConnected();
  const c = getClient();
  const raw = await c.get(key);
  if (raw == null) return null;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return null;
  }
}

export async function setJson(key: string, value: unknown, ttlSeconds: number): Promise<void> {
  await ensureConnected();
  const c = getClient();
  await c.set(key, JSON.stringify(value), { EX: ttlSeconds });
}

export async function del(keys: string | string[]): Promise<void> {
  await ensureConnected();
  const c = getClient();
  const list = Array.isArray(keys) ? keys : [keys];
  if (list.length === 0) return;
  await c.del(list);
}

