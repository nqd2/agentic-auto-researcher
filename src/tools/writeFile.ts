import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  path: z.string().describe("Relative path from cwd"),
  content: z.string().describe("Full file content"),
});

export const writeFileTool: ToolDefinition = {
  name: "write_file",
  description: "Write or overwrite a file under the project cwd.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      path: { type: "string" },
      content: { type: "string" },
    },
    required: ["path", "content"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const full = join(ctx.cwd, input.path);
    await mkdir(dirname(full), { recursive: true });
    await writeFile(full, input.content, "utf8");
    return `Wrote ${full}`;
  },
};
