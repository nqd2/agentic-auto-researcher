import type { ZodType } from "zod";
import type {
  PermissionDecision,
  PermissionRequest,
  ToolPermissionContext,
} from "./permissions/index.js";
import type { AskUserRequest } from "./session/askUserTypes.js";

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
  permission?: ToolPermissionContext;
  onPermissionRequest?: (r: PermissionRequest) => Promise<PermissionDecision>;
  onTool?: (name: string, summary: string) => void;
  onStream?: (chunk: string) => void;
  signal?: AbortSignal;
  /** Interactive TUI: ask user multi-choice / free-text; return JSON string for tool result. */
  onAskUser?: (req: AskUserRequest) => Promise<string>;
  onTodosUpdated?: () => void;
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
