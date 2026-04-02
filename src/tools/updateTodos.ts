import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import { upsertTodos } from "../session/todos.js";

const itemSchema = z.object({
  id: z.string().min(1),
  content: z.string(),
  status: z.enum(["pending", "in_progress", "completed", "cancelled"]),
});

const schema = z.object({
  merge: z
    .boolean()
    .optional()
    .default(true)
    .describe("If false, replace entire todo list"),
  todos: z.array(itemSchema).min(1),
});

export const updateTodosTool: ToolDefinition = {
  name: "update_todos",
  description:
    "Update the visible task checklist for this session. Use to track research steps: pending / in_progress / completed / cancelled.",
  zodSchema: schema,
  inputSchema: {
    type: "object",
    properties: {
      merge: { type: "boolean" },
      todos: {
        type: "array",
        items: {
          type: "object",
          properties: {
            id: { type: "string" },
            content: { type: "string" },
            status: {
              type: "string",
              enum: ["pending", "in_progress", "completed", "cancelled"],
            },
          },
          required: ["id", "content", "status"],
        },
      },
    },
    required: ["todos"],
  },
  async execute(raw, ctx) {
    const input = schema.parse(raw);
    upsertTodos(ctx.sessionId, input.todos, input.merge);
    ctx.onTodosUpdated?.();
    return JSON.stringify({
      ok: true,
      count: input.todos.length,
      merge: input.merge,
    });
  },
};
