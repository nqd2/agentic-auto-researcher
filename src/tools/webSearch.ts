import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  query: z.string().describe("Search query"),
});

export const webSearchTool: ToolDefinition = {
  name: "web_search",
  description: "Fetch a lightweight HTML search snippet (DuckDuckGo html).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: { query: { type: "string" } },
    required: ["query"],
  },
  async execute(raw) {
    const input = schema.parse(raw);
    const q = encodeURIComponent(input.query);
    const url = `https://html.duckduckgo.com/html/?q=${q}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "aar-research-bot/0.1" },
    });
    const html = await res.text();
    const stripped = html.replace(/<[^>]+>/g, " ").slice(0, 8000);
    return stripped.trim() || "Empty result";
  },
};
