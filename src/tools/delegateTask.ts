import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { getEmptyToolPermissionContext } from "../permissions/index.js";
import { nativeToolList } from "./nativeTools.js";

const schema = z.object({
  goal: z.string().min(1),
  allowed_tools: z
    .array(z.string())
    .min(1)
    .describe("Whitelist of tool names the sub-agent may call"),
  max_steps: z.number().int().min(1).max(48).optional().default(16),
});

export function createDelegateTaskTool(
  getEnv: () => EnvConfig,
  mcpExtra: ToolDefinition[],
): ToolDefinition {
  return {
    name: "delegate_task",
    description:
      "Run a focused sub-agent with a strict tool whitelist to complete a sub-goal. Does not write to session chat history. Do not include delegate_task in allowed_tools. Forward permission prompts to the user when bash/git_commit/playwright run in the sub-agent.",
    zodSchema: schema,
    inputSchema: {
      type: "object",
      properties: {
        goal: { type: "string" },
        allowed_tools: { type: "array", items: { type: "string" } },
        max_steps: { type: "number" },
      },
      required: ["goal", "allowed_tools"],
    },
    async execute(raw, ctx) {
      const input = schema.parse(raw);
      const names = new Set(
        input.allowed_tools.filter((n) => n !== "delegate_task"),
      );
      if (names.size === 0) {
        return "Error: allowed_tools empty after removing delegate_task.";
      }
      const known = new Set(
        [...nativeToolList(getEnv), ...mcpExtra].map((t) => t.name),
      );
      const unknown = [...names].filter((n) => !known.has(n));
      if (unknown.length) {
        return `Error: unknown tool names: ${unknown.join(", ")}`;
      }
      const { runIsolatedAgentTurn } = await import("../QueryEngine.js");
      return runIsolatedAgentTurn(
        `Sub-agent goal:\n${input.goal}\n\nFinish with a concise summary of findings for the main agent.`,
        {
          cwd: ctx.cwd,
          aarRoot: ctx.aarRoot,
          env: getEnv(),
          sessionId: ctx.sessionId,
          permission: ctx.permission ?? getEmptyToolPermissionContext(),
          onPermissionRequest: ctx.onPermissionRequest,
          onTool: ctx.onTool,
          onStream: ctx.onStream,
          signal: ctx.signal,
          onAskUser: ctx.onAskUser,
          onTodosUpdated: ctx.onTodosUpdated,
          allowedToolNames: [...names],
          mcpExtraTools: mcpExtra,
          maxIterations: input.max_steps,
        },
      );
    },
  };
}
