import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { listWorkspaceFiles } from "../services/memory/lspStub.js";

const schema = z.object({
  maxFiles: z.number().optional().default(200),
});

export function createLspListTool(getEnv: () => EnvConfig): ToolDefinition {
  return {
    name: "workspace_list",
    description:
      "Fast file index: list files under LSP_WORKSPACE_ROOT or cwd (degraded LSP).",
    zodSchema: schema,
    inputSchema: {
      type: "object",
      properties: { maxFiles: { type: "number" } },
      required: [],
    },
    async execute(raw) {
      const input = schema.parse(raw);
      const env = getEnv();
      return listWorkspaceFiles(env, input.maxFiles);
    },
  };
}
