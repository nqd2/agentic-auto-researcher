export type PermissionMode = "default" | "acceptEdits" | "bypass";

export type ToolPermissionContext = {
  mode: PermissionMode;
  /** When true, auto-deny dangerous tools */
  dryRun?: boolean;
  /** Session-local: tool names that skip the dangerous-tool prompt */
  alwaysAllow?: Set<string>;
};

/** Result from the interactive UI; engine only sees allow/deny after normalization. */
export type PermissionUiResult = "allow" | "deny" | "always_allow";

export type PermissionDecision = "allow" | "deny";

export type PermissionRequest = {
  toolName: string;
  inputSummary: string;
};

const DANGEROUS = new Set([
  "bash",
  "playwright_navigate",
  "playwright_click",
  "git_commit",
  "shell_kill",
]);

export async function checkToolPermission(
  ctx: ToolPermissionContext,
  req: PermissionRequest,
  onAsk?: (r: PermissionRequest) => Promise<PermissionUiResult>,
): Promise<PermissionDecision> {
  if (ctx.mode === "bypass") return "allow";
  if (ctx.alwaysAllow?.has(req.toolName)) return "allow";
  if (!DANGEROUS.has(req.toolName)) return "allow";
  if (ctx.dryRun) return "deny";
  if (onAsk) {
    const ui = await onAsk(req);
    if (ui === "always_allow") {
      if (!ctx.alwaysAllow) ctx.alwaysAllow = new Set();
      ctx.alwaysAllow.add(req.toolName);
      return "allow";
    }
    return ui === "deny" ? "deny" : "allow";
  }
  return "allow";
}

export function getEmptyToolPermissionContext(): ToolPermissionContext {
  return { mode: "default" };
}
