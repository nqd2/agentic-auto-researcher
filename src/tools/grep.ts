import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  pattern: z.string(),
  glob: z.string().optional().default("**/*"),
});

export const grepTool: ToolDefinition = {
  name: "grep",
  description: "Search for a regex pattern in files using Bun grep (fast).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      pattern: { type: "string" },
      glob: { type: "string" },
    },
    required: ["pattern"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    const glob = new Bun.Glob(input.glob);
    const re = new RegExp(input.pattern, "gi");
    const matches: string[] = [];
    for await (const file of glob.scan({ cwd: ctx.cwd, onlyFiles: true })) {
      if (matches.length > 50) break;
      const text = await Bun.file(`${ctx.cwd}/${file}`)
        .text()
        .catch(() => "");
      if (re.test(text)) {
        matches.push(file);
        re.lastIndex = 0;
      }
    }
    return matches.length ? matches.join("\n") : "No matches";
  },
};
