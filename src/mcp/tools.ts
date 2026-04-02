import type { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { z } from "zod";
import type { JsonSchema, ToolDefinition } from "../Tool.js";
import { slug } from "./config.js";

function toInputSchema(inputSchema: {
  type: "object";
  properties?: Record<string, object>;
  required?: string[];
}): JsonSchema {
  return {
    type: "object",
    properties: (inputSchema.properties ?? {}) as Record<string, unknown>,
    required: inputSchema.required,
  };
}

export function mcpToolToDefinition(
  serverName: string,
  mcpToolName: string,
  description: string | undefined,
  inputSchema: {
    type: "object";
    properties?: Record<string, object>;
    required?: string[];
  },
  client: Client,
): ToolDefinition {
  const serverSlug = slug(serverName);
  const toolSlug = slug(mcpToolName);
  const name = `mcp__${serverSlug}__${toolSlug}`;
  const schema = toInputSchema(inputSchema);
  return {
    name,
    description:
      description?.trim() ||
      `MCP tool «${mcpToolName}» from server «${serverName}».`,
    inputSchema: schema,
    zodSchema: z.record(z.unknown()),
    async execute(raw) {
      const args =
        typeof raw === "object" && raw !== null && !Array.isArray(raw)
          ? (raw as Record<string, unknown>)
          : {};
      const res = await client.callTool({
        name: mcpToolName,
        arguments: args,
      });
      return JSON.stringify(res).slice(0, 100_000);
    },
  };
}
