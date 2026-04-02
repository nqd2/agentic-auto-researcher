import type { ZodType } from "zod";

export type JsonSchema = {
  type: "object";
  properties: Record<string, unknown>;
  required?: string[];
};

export type ToolDefinition = {
  name: string;
  description: string;
  inputSchema: JsonSchema;
  zodSchema: ZodType;
  execute: (input: unknown, ctx: ToolRunContext) => Promise<string>;
};

export type ToolRunContext = {
  cwd: string;
  sessionId: string;
  aarRoot: string;
};

export function toolToOpenAI(t: ToolDefinition): {
  type: "function";
  function: { name: string; description: string; parameters: JsonSchema };
} {
  return {
    type: "function",
    function: {
      name: t.name,
      description: t.description,
      parameters: t.inputSchema,
    },
  };
}
