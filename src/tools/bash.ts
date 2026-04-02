import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import { runBashWithOptionalBackground } from "./shellSessions.js";

const schema = z.object({
  command: z.string().describe("Shell command to run in project cwd"),
  block_until_ms: z
    .number()
    .int()
    .min(100)
    .max(600_000)
    .optional()
    .default(10_000)
    .describe(
      "Wait up to this many ms; then run in background if still active",
    ),
  max_output_chars: z
    .number()
    .int()
    .min(1)
    .max(500_000)
    .optional()
    .default(100_000),
});

export const bashTool: ToolDefinition = {
  name: "bash",
  description:
    "Run a shell command in the project cwd. Long-running commands (e.g. dev servers) return after block_until_ms with job_id for shell_status/shell_kill.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string" },
      block_until_ms: { type: "number" },
      max_output_chars: { type: "number" },
    },
    required: ["command"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const result = await runBashWithOptionalBackground({
      sessionId: ctx.sessionId,
      cwd: ctx.cwd,
      command: input.command,
      blockUntilMs: input.block_until_ms,
      maxOutputChars: input.max_output_chars,
    });
    return JSON.stringify(result);
  },
};
