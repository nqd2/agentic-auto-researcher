import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { createDelegateTaskTool } from "./delegateTask.js";
import { nativeToolList } from "./nativeTools.js";

export function buildToolRegistry(
  getEnv: () => EnvConfig,
  mcpExtra: ToolDefinition[] = [],
): ToolDefinition[] {
  return [
    ...nativeToolList(getEnv),
    ...mcpExtra,
    createDelegateTaskTool(getEnv, mcpExtra),
  ];
}

export function toolMap(
  registry: ToolDefinition[],
): Map<string, ToolDefinition> {
  return new Map(registry.map((t) => [t.name, t]));
}
