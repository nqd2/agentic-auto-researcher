import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

/** Single segment safe for git CLI args (no shell). */
const safeRef = z
  .string()
  .regex(/^[A-Za-z0-9./_~\-^@[\]:]+$/, "invalid ref characters");
const safePath = z
  .string()
  .min(1)
  .refine((s) => !s.includes("..") && !s.startsWith("-"), "unsafe path");

const schema = z.object({
  staged: z
    .boolean()
    .optional()
    .describe("If true, diff index vs HEAD (--cached) when no refs set"),
  ref_a: safeRef.optional().describe("First ref (commit, branch, HEAD~1, …)"),
  ref_b: safeRef
    .optional()
    .describe("Second ref; if set with ref_a, compares ref_a vs ref_b"),
  paths: z.array(safePath).optional().describe("Limit to these paths"),
  stat: z.boolean().optional().describe("If true, use --stat summary only"),
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

export const gitDiffTool: ToolDefinition = {
  name: "git_diff",
  description:
    "Read-only: run git diff in project cwd. Optionally two refs, paths, --stat, or staged (index vs HEAD). Output may truncate; narrow paths if needed.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      staged: { type: "boolean" },
      ref_a: { type: "string" },
      ref_b: { type: "string" },
      paths: { type: "array", items: { type: "string" } },
      stat: { type: "boolean" },
      max_chars: { type: "number" },
    },
    required: [],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const args: string[] = ["diff"];
    if (input.stat) args.push("--stat");
    if (input.ref_a && input.ref_b) {
      args.push(input.ref_a, input.ref_b);
    } else if (input.ref_a) {
      args.push(input.ref_a);
    } else if (input.staged) {
      args.push("--cached");
    }
    if (input.paths?.length) {
      args.push("--", ...input.paths);
    }
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
      output: `${combined.slice(0, max)}\n... [truncated ${combined.length - max} chars; narrow paths or use stat]`,
    });
  },
};
