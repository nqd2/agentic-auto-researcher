import type { ToolDefinition } from "../Tool.js";
import { McpConnectionManager } from "./manager.js";

let manager: McpConnectionManager | null = null;
let lastAarRoot: string | null = null;
let connectPromise: Promise<void> | null = null;

export async function getMcpTools(aarRoot: string): Promise<ToolDefinition[]> {
  if (lastAarRoot !== aarRoot) {
    if (manager) await manager.closeAll();
    manager = null;
    connectPromise = null;
    lastAarRoot = aarRoot;
  }
  if (!connectPromise) {
    manager = new McpConnectionManager();
    connectPromise = manager.connectFromAarRoot(aarRoot).catch((e) => {
      console.error("[mcp] connect error:", e instanceof Error ? e.message : e);
    });
  }
  await connectPromise;
  return manager?.getTools() ?? [];
}

export async function shutdownMcp(): Promise<void> {
  if (manager) await manager.closeAll();
  manager = null;
  connectPromise = null;
  lastAarRoot = null;
}
