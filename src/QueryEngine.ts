import { randomUUID } from "node:crypto";
import { appendFile, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  type ToolDefinition,
  type ToolRunContext,
  toolToOpenAI,
} from "./Tool.js";
import { buildPassiveContext } from "./context/passiveContext.js";
import type { EnvConfig } from "./env.js";
import { appendHistory, getHistory } from "./history/index.js";
import { getMcpTools } from "./mcp/global.js";
import {
  type PermissionRequest,
  type PermissionUiResult,
  type ToolPermissionContext,
  checkToolPermission,
} from "./permissions/index.js";
import { type LlmMessage, completeChat } from "./services/llm/client.js";
import type { AskUserRequest } from "./session/askUserTypes.js";
import {
  SUBAGENT_SYSTEM,
  buildSystemPrompt,
} from "./skills/buildSystemPrompt.js";
import { nativeToolList } from "./tools/nativeTools.js";
import { buildToolRegistry, toolMap } from "./tools/registry.js";

export type QueryEngineOptions = {
  cwd: string;
  aarRoot: string;
  env: EnvConfig;
  sessionId: string;
  permission: ToolPermissionContext;
  maxIterations?: number;
  onStream?: (chunk: string) => void;
  onTool?: (name: string, summary: string) => void;
  /** When tool permission should ask the user (interactive UI). */
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionUiResult>;
  /** Abort in-flight LLM / tool loop (Ctrl+C interrupt). */
  signal?: AbortSignal;
  onAskUser?: (req: AskUserRequest) => Promise<string>;
  onTodosUpdated?: () => void;
};

export async function runAgentTurn(
  userText: string,
  opt: QueryEngineOptions,
): Promise<{ assistantText: string; messages: LlmMessage[] }> {
  const maxIt = opt.maxIterations ?? 24;
  let systemContent = await buildSystemPrompt({
    cwd: opt.cwd,
    aarRoot: opt.aarRoot,
    sessionId: opt.sessionId,
  });
  if (opt.env.aarPassiveContext) {
    const pc = await buildPassiveContext(opt.cwd);
    systemContent += `\n<passive_context>\n${pc}\n</passive_context>`;
  }
  const mcpTools = await getMcpTools(opt.aarRoot);
  const registry = buildToolRegistry(() => opt.env, mcpTools);
  const tools = registry.map(toolToOpenAI);
  const tmap = toolMap(registry);

  const messages: LlmMessage[] = [
    { role: "system", content: systemContent },
    ...historyToLlm(opt.sessionId),
    { role: "user", content: userText },
  ];

  let lastAssistant = "";
  for (let i = 0; i < maxIt; i++) {
    if (opt.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const assistant = await completeChat(opt.env, messages, tools, opt.signal);
    messages.push(assistant);
    lastAssistant = assistant.content ?? "";

    if (assistant.content && opt.onStream) {
      opt.onStream(assistant.content);
    }

    if (!assistant.tool_calls?.length) {
      appendHistory(opt.sessionId, { role: "user", content: userText });
      appendHistory(opt.sessionId, {
        role: "assistant",
        content: lastAssistant,
      });
      return { assistantText: lastAssistant, messages };
    }

    for (const tc of assistant.tool_calls) {
      if (opt.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const name = tc.function.name;
      const tool = tmap.get(name);
      let result = "";
      if (!tool) {
        result = `Unknown tool ${name}`;
      } else {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          result = "Invalid JSON arguments";
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
          continue;
        }
        const check = tool.zodSchema.safeParse(parsed);
        if (!check.success) {
          result = `Validation error: ${check.error.message}`;
        } else {
          const decision = await checkToolPermission(
            opt.permission,
            {
              toolName: name,
              inputSummary: JSON.stringify(parsed).slice(0, 500),
            },
            opt.onPermissionRequest,
          );
          if (decision === "deny") {
            result = "Permission denied for this tool.";
          } else {
            const ctx: ToolRunContext = {
              cwd: opt.cwd,
              sessionId: opt.sessionId,
              aarRoot: opt.aarRoot,
              permission: opt.permission,
              onPermissionRequest: opt.onPermissionRequest,
              onTool: opt.onTool,
              onStream: opt.onStream,
              signal: opt.signal,
              onAskUser: opt.onAskUser,
              onTodosUpdated: opt.onTodosUpdated,
            };
            if (opt.onTool)
              opt.onTool(name, JSON.stringify(parsed).slice(0, 200));
            try {
              result = await tool.execute(check.data, ctx);
            } catch (e) {
              result = `Error: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.slice(0, 100_000),
      });
    }
  }

  appendHistory(opt.sessionId, { role: "user", content: userText });
  appendHistory(opt.sessionId, { role: "assistant", content: lastAssistant });
  return {
    assistantText: `${lastAssistant}\n[stopped: max iterations]`,
    messages,
  };
}

export type IsolatedAgentTurnOptions = {
  cwd: string;
  aarRoot: string;
  env: EnvConfig;
  sessionId: string;
  permission: ToolPermissionContext;
  allowedToolNames: string[];
  /** Overrides default sub-agent system prompt (e.g. reviewer role). */
  systemPrompt?: string;
  mcpExtraTools?: ToolDefinition[];
  maxIterations?: number;
  onStream?: (chunk: string) => void;
  onTool?: (name: string, summary: string) => void;
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionUiResult>;
  signal?: AbortSignal;
  onAskUser?: (req: AskUserRequest) => Promise<string>;
  onTodosUpdated?: () => void;
};

/** Nested agent: no session history writes; subset of tools only. */
export async function runIsolatedAgentTurn(
  userText: string,
  opt: IsolatedAgentTurnOptions,
): Promise<string> {
  const maxIt = opt.maxIterations ?? 16;
  const all = [...nativeToolList(() => opt.env), ...(opt.mcpExtraTools ?? [])];
  const allow = new Set(opt.allowedToolNames);
  const registry = all.filter((t) => allow.has(t.name));
  if (registry.length === 0) {
    return "Error: no tools available after applying whitelist.";
  }
  const tools = registry.map(toolToOpenAI);
  const tmap = toolMap(registry);
  const system = opt.systemPrompt ?? SUBAGENT_SYSTEM;
  const messages: LlmMessage[] = [
    { role: "system", content: system },
    { role: "user", content: userText },
  ];
  let lastAssistant = "";
  for (let i = 0; i < maxIt; i++) {
    if (opt.signal?.aborted) {
      throw new DOMException("Aborted", "AbortError");
    }
    const assistant = await completeChat(opt.env, messages, tools, opt.signal);
    messages.push(assistant);
    lastAssistant = assistant.content ?? "";
    if (assistant.content && opt.onStream) opt.onStream(assistant.content);
    if (!assistant.tool_calls?.length) {
      return lastAssistant;
    }
    for (const tc of assistant.tool_calls) {
      if (opt.signal?.aborted) {
        throw new DOMException("Aborted", "AbortError");
      }
      const name = tc.function.name;
      const tool = tmap.get(name);
      let result = "";
      if (!tool) {
        result = `Unknown tool ${name}`;
      } else {
        let parsed: Record<string, unknown>;
        try {
          parsed = JSON.parse(tc.function.arguments) as Record<string, unknown>;
        } catch {
          result = "Invalid JSON arguments";
          messages.push({
            role: "tool",
            tool_call_id: tc.id,
            content: result,
          });
          continue;
        }
        const check = tool.zodSchema.safeParse(parsed);
        if (!check.success) {
          result = `Validation error: ${check.error.message}`;
        } else {
          const decision = await checkToolPermission(
            opt.permission,
            {
              toolName: name,
              inputSummary: JSON.stringify(parsed).slice(0, 500),
            },
            opt.onPermissionRequest,
          );
          if (decision === "deny") {
            result = "Permission denied for this tool.";
          } else {
            const ctx: ToolRunContext = {
              cwd: opt.cwd,
              sessionId: opt.sessionId,
              aarRoot: opt.aarRoot,
              permission: opt.permission,
              onPermissionRequest: opt.onPermissionRequest,
              onTool: opt.onTool,
              onStream: opt.onStream,
              signal: opt.signal,
              onAskUser: opt.onAskUser,
              onTodosUpdated: opt.onTodosUpdated,
            };
            if (opt.onTool)
              opt.onTool(name, JSON.stringify(parsed).slice(0, 200));
            try {
              result = await tool.execute(check.data, ctx);
            } catch (e) {
              result = `Error: ${e instanceof Error ? e.message : String(e)}`;
            }
          }
        }
      }
      messages.push({
        role: "tool",
        tool_call_id: tc.id,
        content: result.slice(0, 100_000),
      });
    }
  }
  return `${lastAssistant}\n[sub-agent: max iterations]`;
}

function historyToLlm(sessionId: string): LlmMessage[] {
  const h = getHistory(sessionId);
  const out: LlmMessage[] = [];
  for (const m of h) {
    if (m.role === "user") out.push({ role: "user", content: m.content });
    if (m.role === "assistant") {
      out.push({ role: "assistant", content: m.content });
    }
  }
  return out;
}

export async function writeResearchPlan(
  cwd: string,
  aarRoot: string,
  topic: string,
  steps: string[],
): Promise<string> {
  const id = randomUUID();
  const dir = join(aarRoot, "plans");
  await mkdir(dir, { recursive: true });
  const file = join(dir, `plan-${id}.json`);
  const body = {
    id,
    topic,
    createdAt: new Date().toISOString(),
    steps,
    cwd,
  };
  await writeFile(file, JSON.stringify(body, null, 2), "utf8");
  return file;
}

export async function appendTrace(
  aarRoot: string,
  line: Record<string, unknown>,
): Promise<void> {
  const dir = join(aarRoot, "traces");
  await mkdir(dir, { recursive: true });
  const f = join(dir, "trace.ndjson");
  await appendFile(f, `${JSON.stringify(line)}\n`, "utf8");
}
