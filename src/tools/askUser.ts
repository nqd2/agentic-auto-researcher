import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { AskUserRequest } from "../session/askUserTypes.js";

const optionSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1),
});

const questionSchema = z.object({
  id: z.string().min(1),
  prompt: z.string().min(1),
  options: z.array(optionSchema).optional(),
  allow_multiple: z.boolean().optional().default(false),
  allow_free_text: z.boolean().optional().default(true),
});

const schema = z.object({
  title: z.string().optional(),
  questions: z.array(questionSchema).min(1),
});

export const askUserTool: ToolDefinition = {
  name: "ask_user",
  description:
    "Pause and ask the user multi-choice / free-text questions in the TUI. Returns JSON answers by question id. In non-interactive mode this fails—avoid if headless.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      title: { type: "string" },
      questions: { type: "array", items: { type: "object" } },
    },
    required: ["questions"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    if (!ctx.onAskUser) {
      return JSON.stringify({
        error:
          "ask_user is only available in interactive TUI (no onAskUser callback).",
      });
    }
    const req: AskUserRequest = {
      title: input.title,
      questions: input.questions.map((q) => ({
        id: q.id,
        prompt: q.prompt,
        options: q.options,
        allow_multiple: q.allow_multiple,
        allow_free_text: q.allow_free_text,
      })),
    };
    return await ctx.onAskUser(req);
  },
};
