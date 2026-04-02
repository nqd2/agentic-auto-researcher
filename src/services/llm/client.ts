import Anthropic from "@anthropic-ai/sdk";
import type { JsonSchema } from "../../Tool.js";
import { recordUsage } from "../../cost/index.js";
import type { EnvConfig } from "../../env.js";

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | {
      role: "assistant";
      content: string | null;
      tool_calls?: Array<{
        id: string;
        type: "function";
        function: { name: string; arguments: string };
      }>;
    }
  | { role: "tool"; tool_call_id: string; content: string };

export type OpenAITool = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JsonSchema;
  };
};

export type AssistantMessage = Extract<LlmMessage, { role: "assistant" }>;

export async function completeChat(
  env: EnvConfig,
  messages: LlmMessage[],
  tools: OpenAITool[],
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  if (env.providerStyle === "anthropic") {
    return completeAnthropic(env, messages, tools, signal);
  }
  return completeOpenAI(env, messages, tools, signal);
}

async function completeOpenAI(
  env: EnvConfig,
  messages: LlmMessage[],
  tools: OpenAITool[],
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  const url = `${env.providerUrl.replace(/\/$/, "")}/chat/completions`;
  const body: Record<string, unknown> = {
    model: env.model,
    messages,
    temperature: 0.2,
  };
  if (tools.length > 0) {
    body.tools = tools;
    body.tool_choice = "auto";
  }
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.apiKey}`,
    },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`LLM error ${res.status}: ${t}`);
  }
  const data = (await res.json()) as {
    usage?: { prompt_tokens?: number; completion_tokens?: number };
    choices?: Array<{
      message?: {
        role: string;
        content: string | null;
        tool_calls?: Array<{
          id: string;
          type: string;
          function: { name: string; arguments: string };
        }>;
      };
    }>;
  };
  const u = data.usage;
  if (u?.prompt_tokens != null && u?.completion_tokens != null) {
    recordUsage(u.prompt_tokens, u.completion_tokens);
  }
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error("No assistant message");
  return {
    role: "assistant",
    content: msg.content ?? null,
    tool_calls: msg.tool_calls?.map((tc) => ({
      id: tc.id,
      type: "function" as const,
      function: {
        name: tc.function.name,
        arguments: tc.function.arguments,
      },
    })),
  };
}

function openAiMessagesToAnthropic(messages: LlmMessage[]): {
  system: string;
  params: Anthropic.Messages.MessageParam[];
} {
  const systemParts: string[] = [];
  const params: Anthropic.Messages.MessageParam[] = [];
  for (const m of messages) {
    if (m.role === "system") {
      systemParts.push(m.content);
      continue;
    }
    if (m.role === "user") {
      params.push({ role: "user", content: m.content });
      continue;
    }
    if (m.role === "assistant") {
      const blocks: Anthropic.Messages.ContentBlockParam[] = [];
      if (m.content) {
        blocks.push({ type: "text", text: m.content });
      }
      if (m.tool_calls?.length) {
        for (const tc of m.tool_calls) {
          let input: Record<string, unknown> = {};
          try {
            input = JSON.parse(tc.function.arguments) as Record<
              string,
              unknown
            >;
          } catch {
            input = { raw: tc.function.arguments };
          }
          blocks.push({
            type: "tool_use",
            id: tc.id,
            name: tc.function.name,
            input,
          });
        }
      }
      if (blocks.length === 0) {
        blocks.push({ type: "text", text: "" });
      }
      params.push({ role: "assistant", content: blocks });
      continue;
    }
    if (m.role === "tool") {
      const last = params[params.length - 1];
      const toolBlock: Anthropic.Messages.ToolResultBlockParam = {
        type: "tool_result",
        tool_use_id: m.tool_call_id,
        content: m.content,
      };
      if (last?.role === "user" && Array.isArray(last.content)) {
        (last.content as Anthropic.Messages.ContentBlockParam[]).push(
          toolBlock,
        );
      } else {
        params.push({ role: "user", content: [toolBlock] });
      }
    }
  }
  return { system: systemParts.join("\n\n"), params };
}

async function completeAnthropic(
  env: EnvConfig,
  messages: LlmMessage[],
  tools: OpenAITool[],
  signal?: AbortSignal,
): Promise<AssistantMessage> {
  const client = new Anthropic({
    apiKey: env.apiKey,
    baseURL: env.providerUrl.replace(/\/$/, ""),
  });
  const { system, params } = openAiMessagesToAnthropic(messages);
  const anthropicTools =
    tools.length > 0
      ? tools.map((t) => ({
          name: t.function.name,
          description: t.function.description,
          input_schema: {
            type: "object" as const,
            properties: t.function.parameters.properties as Record<
              string,
              unknown
            >,
            required: t.function.parameters.required,
          },
        }))
      : undefined;

  const modelId = env.model.includes("claude")
    ? env.model
    : "claude-3-5-sonnet-20241022";

  const resp = await client.messages.create(
    {
      model: modelId,
      max_tokens: 4096,
      system: system || undefined,
      messages: params,
      tools: anthropicTools,
    },
    { signal },
  );

  if (resp.usage) {
    recordUsage(resp.usage.input_tokens, resp.usage.output_tokens);
  }

  const toolCalls: Array<{
    id: string;
    type: "function";
    function: { name: string; arguments: string };
  }> = [];
  const textParts: string[] = [];
  for (const block of resp.content) {
    if (block.type === "text") textParts.push(block.text);
    if (block.type === "tool_use") {
      toolCalls.push({
        id: block.id,
        type: "function",
        function: {
          name: block.name,
          arguments: JSON.stringify(block.input),
        },
      });
    }
  }
  return {
    role: "assistant",
    content: textParts.join("\n") || null,
    tool_calls: toolCalls.length ? toolCalls : undefined,
  };
}
