import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  message: z.string().min(1),
});

export const gitCommitTool: ToolDefinition = {
  name: "git_commit",
  description:
    "Stage all changes and create a git commit in the project cwd (requires git repo).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: { message: { type: "string" } },
    required: ["message"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const add = Bun.spawn(["git", "add", "-A"], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    await add.exited;
    const addErr = await new Response(add.stderr).text();
    if (add.exitCode !== 0) {
      return `git add failed: ${addErr}`;
    }
    const commit = Bun.spawn(["git", "commit", "-m", input.message], {
      cwd: ctx.cwd,
      stdout: "pipe",
      stderr: "pipe",
    });
    const out = await new Response(commit.stdout).text();
    const err = await new Response(commit.stderr).text();
    await commit.exited;
    return JSON.stringify({
      exitCode: commit.exitCode,
      stdout: out,
      stderr: err,
    });
  },
};
