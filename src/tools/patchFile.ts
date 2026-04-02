import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  path: z.string().describe("Relative path from cwd"),
  old_string: z
    .string()
    .describe("Exact text to find; must be unique unless replace_all"),
  new_string: z.string().describe("Replacement text"),
  replace_all: z.boolean().optional().default(false),
  strict_single_match: z.boolean().optional().default(true),
});

function countOccurrences(hay: string, needle: string): number {
  if (!needle) return 0;
  let n = 0;
  let i = 0;
  while (i <= hay.length - needle.length) {
    const j = hay.indexOf(needle, i);
    if (j === -1) break;
    n++;
    i = j + needle.length;
  }
  return n;
}

export const patchFileTool: ToolDefinition = {
  name: "patch_file",
  description:
    "Apply a focused search/replace patch to a file. Prefer this over write_file when editing—send only the changed region. old_string must match exactly (unless replace_all).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      old_string: { type: "string" },
      new_string: { type: "string" },
      replace_all: { type: "boolean" },
      strict_single_match: { type: "boolean" },
    },
    required: ["path", "old_string", "new_string"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const full = join(ctx.cwd, input.path);
    let content: string;
    try {
      content = await readFile(full, "utf8");
    } catch {
      return JSON.stringify({
        ok: false,
        error: `Cannot read file: ${full}`,
      });
    }
    const matches = countOccurrences(content, input.old_string);
    if (matches === 0) {
      return JSON.stringify({
        ok: false,
        error: "old_string not found in file.",
        path: full,
      });
    }

    if (!input.replace_all && input.strict_single_match && matches > 1) {
      return JSON.stringify({
        ok: false,
        error: `old_string matches ${matches} times; narrow context or set strict_single_match=false / replace_all=true.`,
        path: full,
      });
    }

    const beforeLines = content.split("\n").length;
    let next: string;
    if (input.replace_all) {
      next = content.split(input.old_string).join(input.new_string);
    } else {
      next = content.replace(input.old_string, input.new_string);
    }
    const afterLines = next.split("\n").length;
    await writeFile(full, next, "utf8");
    return JSON.stringify({
      ok: true,
      path: full,
      replacements: input.replace_all ? matches : 1,
      lineCountBefore: beforeLines,
      lineCountAfter: afterLines,
    });
  },
};
