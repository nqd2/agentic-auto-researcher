import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import { getShellJob, listShellJobs } from "./shellSessions.js";

const schema = z.object({
  job_id: z
    .string()
    .optional()
    .describe("If set, return that job; else list recent background jobs"),
});

export const shellStatusTool: ToolDefinition = {
  name: "shell_status",
  description:
    "Inspect background shell jobs started by bash after timeout. Omit job_id to list.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: { job_id: { type: "string" } },
    required: [],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    if (input.job_id) {
      const j = getShellJob(ctx.sessionId, input.job_id);
      if (!j)
        return JSON.stringify({
          error: `No job ${input.job_id}`,
          sessionId: ctx.sessionId,
        });
      return JSON.stringify({
        job_id: j.id,
        pid: j.pid,
        running: j.running,
        exitCode: j.exitCode,
        command: j.command,
        startedAt: j.startedAt,
        output: j.buffer.slice(-80_000),
      });
    }
    const all = listShellJobs(ctx.sessionId);
    return JSON.stringify({
      count: all.length,
      jobs: all.map((j) => ({
        job_id: j.id,
        pid: j.pid,
        running: j.running,
        exitCode: j.exitCode,
        command: j.command.slice(0, 200),
      })),
    });
  },
};
