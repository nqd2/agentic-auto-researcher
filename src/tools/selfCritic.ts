import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";

const schema = z.object({
  goal: z.string(),
  attemptSummary: z.string(),
  failureSignals: z.string().optional(),
});

export const selfCriticTool: ToolDefinition = {
  name: "self_critic",
  description:
    "Structured reflection: compare attempt vs goal and list concrete fixes (no external IO).",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      goal: { type: "string" },
      attemptSummary: { type: "string" },
      failureSignals: { type: "string" },
    },
    required: ["goal", "attemptSummary"],
  },
  async execute(raw) {
    const input = schema.parse(raw);
    const lines = [
      "## Self-critique",
      `- Goal: ${input.goal}`,
      `- Attempt: ${input.attemptSummary}`,
      input.failureSignals ? `- Signals: ${input.failureSignals}` : "",
      "",
      "Checklist:",
      "1. Does output satisfy every part of the goal?",
      "2. Are sources / commands reproducible?",
      "3. What single next action would unblock progress?",
    ].filter(Boolean);
    return lines.join("\n");
  },
};
