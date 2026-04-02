import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  path: z.string().describe("Relative path from cwd"),
  maxBytes: z.number().optional().default(100_000),
});

export const readFileTool: ToolDefinition = {
  name: "read_file",
  description: "Read a text file under the project cwd.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      maxBytes: { type: "number" },
    },
    required: ["path"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const full = join(ctx.cwd, input.path);
    const buf = await readFile(full).catch(() => null);
    if (!buf) return `Error: cannot read ${full}`;
    const slice = buf.subarray(0, input.maxBytes);
    const text = slice.toString("utf8");
    const truncated = buf.length > input.maxBytes;
    return truncated ? `${text}\n...[truncated]` : text;
  },
};
