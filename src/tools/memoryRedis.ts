import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { redisGetJson, redisSetJson } from "../services/memory/redisSession.js";

const setSchema = z.object({
  key: z.string(),
  value: z.string().describe("JSON string or plain text"),
  ttlSec: z.number().optional().default(86400),
});

const getSchema = z.object({
  key: z.string(),
});

export function createRedisSetTool(getEnv: () => EnvConfig): ToolDefinition {
  return {
    name: "redis_set",
    description: "Store JSON or text in Redis session memory.",
    zodSchema: setSchema,
    inputSchema: {
      type: "object",
      properties: {
        key: { type: "string" },
        value: { type: "string" },
        ttlSec: { type: "number" },
      },
      required: ["key", "value"],
    },
    async execute(raw) {
      const input = setSchema.parse(raw);
      let parsed: unknown = input.value;
      try {
        parsed = JSON.parse(input.value) as unknown;
      } catch {
        parsed = input.value;
      }
      const ok = await redisSetJson(getEnv(), input.key, parsed, input.ttlSec);
      return ok ? "OK" : "Redis unavailable";
    },
  };
}

export function createRedisGetTool(getEnv: () => EnvConfig): ToolDefinition {
  return {
    name: "redis_get",
    description: "Read JSON value from Redis by key.",
    zodSchema: getSchema,
    inputSchema: {
      type: "object",
      properties: { key: { type: "string" } },
      required: ["key"],
    },
    async execute(raw) {
      const input = getSchema.parse(raw);
      const v = await redisGetJson<unknown>(getEnv(), input.key);
      return v == null ? "null or missing" : JSON.stringify(v);
    },
  };
}
