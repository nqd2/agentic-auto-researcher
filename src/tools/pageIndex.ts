import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  path: z
    .string()
    .describe("Path to PDF or text file under cwd (text only in MVP)"),
  maxChars: z.number().optional().default(20_000),
});

/**
 * MVP: index plain text / extract raw bytes as utf8 for .txt, .md.
 * Full PDF PageIndex pipeline can replace internals later.
 */
export const pageIndexTool: ToolDefinition = {
  name: "page_index",
  description:
    "Load and chunk a text-capable document for structured recall (MVP: .md/.txt only).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      maxChars: { type: "number" },
    },
    required: ["path"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const full = join(ctx.cwd, input.path);
    const buf = await readFile(full).catch(() => null);
    if (!buf) return `Cannot read ${full}`;
    const text = buf.toString("utf8").slice(0, input.maxChars);
    const pages = text.split(/\n\n+/).map((p, i) => ({ page: i + 1, text: p }));
    return JSON.stringify({ source: input.path, pages: pages.slice(0, 200) });
  },
};
