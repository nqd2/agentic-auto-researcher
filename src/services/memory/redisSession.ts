import { type RedisClientType, createClient } from "redis";
import type { EnvConfig } from "../../env.js";

let client: RedisClientType | null = null;
let connectFailed = false;

export async function getRedis(
  env: EnvConfig,
): Promise<RedisClientType | null> {
  if (!env.redisUrl || connectFailed) return null;
  if (client?.isOpen) return client;
  try {
    client = createClient({ url: env.redisUrl });
    client.on("error", () => {
      connectFailed = true;
    });
    await client.connect();
    return client;
  } catch {
    connectFailed = true;
    return null;
  }
}

export async function redisSetJson(
  env: EnvConfig,
  key: string,
  value: unknown,
  ttlSec = 86400,
): Promise<boolean> {
  const r = await getRedis(env);
  if (!r) return false;
  await r.set(key, JSON.stringify(value), { EX: ttlSec });
  return true;
}

export async function redisGetJson<T>(
  env: EnvConfig,
  key: string,
): Promise<T | null> {
  const r = await getRedis(env);
  if (!r) return null;
  const v = await r.get(key);
  if (!v) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
}
