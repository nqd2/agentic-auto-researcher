import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  filename: z.string().describe("e.g. report-2026-04-02.md"),
  markdown: z.string(),
});

export const reportWriterTool: ToolDefinition = {
  name: "report_write",
  description: "Write a Markdown report under .aar/reports/.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      filename: { type: "string" },
      markdown: { type: "string" },
    },
    required: ["filename", "markdown"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const dir = join(ctx.aarRoot, "reports");
    await mkdir(dir, { recursive: true });
    const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const full = join(dir, safe);
    await writeFile(full, input.markdown, "utf8");
    return full;
  },
};
