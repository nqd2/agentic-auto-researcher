import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import { getShellJob, killShellJob } from "./shellSessions.js";

const schema = z.object({
  job_id: z.string().min(1),
});

export const shellKillTool: ToolDefinition = {
  name: "shell_kill",
  description:
    "Send kill to a background shell job by job_id (from bash background mode).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: { job_id: { type: "string" } },
    required: ["job_id"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const j = getShellJob(ctx.sessionId, input.job_id);
    if (!j) return JSON.stringify({ ok: false, error: "job not found" });
    const ok = killShellJob(ctx.sessionId, input.job_id);
    return JSON.stringify({
      ok,
      job_id: input.job_id,
      wasRunning: j.running,
    });
  },
};
