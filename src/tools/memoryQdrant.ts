import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { qdrantSearch, qdrantUpsert } from "../services/memory/qdrantStore.js";

const upsertSchema = z.object({
  id: z.string(),
  text: z.string(),
  payload: z.record(z.string(), z.any()).optional(),
});

const searchSchema = z.object({
  query: z.string(),
  limit: z.number().optional().default(5),
});

export function createQdrantUpsertTool(
  getEnv: () => EnvConfig,
): ToolDefinition {
  return {
    name: "qdrant_upsert",
    description: "Store a text chunk in long-term vector memory (Qdrant).",
    zodSchema: upsertSchema,
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string" },
        text: { type: "string" },
        payload: { type: "object" },
      },
      required: ["id", "text"],
    },
    async execute(raw) {
      const input = upsertSchema.parse(raw);
      const env = getEnv();
      return qdrantUpsert(env, input.id, input.payload ?? {}, input.text);
    },
  };
}

export function createQdrantSearchTool(
  getEnv: () => EnvConfig,
): ToolDefinition {
  return {
    name: "qdrant_search",
    description:
      "Semantic-ish search over Qdrant collection (degraded embedding).",
    zodSchema: searchSchema,
    inputSchema: {
      type: "object",
      properties: {
        query: { type: "string" },
        limit: { type: "number" },
      },
      required: ["query"],
    },
    async execute(raw) {
      const input = searchSchema.parse(raw);
      const env = getEnv();
      return qdrantSearch(env, input.query, input.limit);
    },
  };
}
