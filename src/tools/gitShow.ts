import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const safeRev = z
  .string()
  .min(1)
  .regex(/^[A-Za-z0-9./_~\-^@[\]:]+$/, "invalid rev characters");
const safePath = z
  .string()
  .min(1)
  .refine((s) => !s.includes("..") && !s.startsWith("-"), "unsafe path");

const schema = z.object({
  rev: safeRev.describe("Commit or ref to show"),
  path: safePath
    .optional()
    .describe("If set, show this file at rev (git show rev -- path)"),
  max_chars: z.number().optional().default(120_000),
});

async function runGit(
  cwd: string,
  args: string[],
): Promise<{ code: number; out: string; err: string }> {
  const proc = Bun.spawn(["git", ...args], {
    cwd,
    stdout: "pipe",
    stderr: "pipe",
  });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  await proc.exited;
  return { code: proc.exitCode ?? -1, out, err };
}

export const gitShowTool: ToolDefinition = {
  name: "git_show",
  description:
    "Read-only: git show for a commit/ref. Optional path limits to one file. Output may truncate.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      rev: { type: "string" },
      path: { type: "string" },
      max_chars: { type: "number" },
    },
    required: ["rev"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const args = ["show", "--no-color", input.rev];
    if (input.path) args.push("--", input.path);
    const { code, out, err } = await runGit(ctx.cwd, args);
    const combined =
      code !== 0 && !out
        ? `exit ${code}\n${err}`
        : out + (err ? `\n${err}` : "");
    const max = input.max_chars;
    if (combined.length <= max) {
      return JSON.stringify({
        exitCode: code,
        truncated: false,
        output: combined,
      });
    }
    return JSON.stringify({
      exitCode: code,
      truncated: true,
      output: `${combined.slice(0, max)}\n... [truncated ${combined.length - max} chars]`,
    });
  },
};
