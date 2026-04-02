import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  command: z.string().describe("Shell command to run in project cwd"),
});

export const bashTool: ToolDefinition = {
  name: "bash",
  description:
    "Run a shell command in the project working directory (bash/sh).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      command: { type: "string", description: "Shell command" },
    },
    required: ["command"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const proc = Bun.spawn(["sh", "-c", input.command], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const [out, err] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const code = await proc.exited;
    return JSON.stringify({ exitCode: code, stdout: out, stderr: err });
  },
};
