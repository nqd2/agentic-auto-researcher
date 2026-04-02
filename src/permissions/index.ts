export type PermissionMode = "default" | "acceptEdits" | "bypass";

export type ToolPermissionContext = {
  mode: PermissionMode;
  /** When true, auto-deny dangerous tools */
  dryRun?: boolean;
};

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
]);

export async function checkToolPermission(
  ctx: ToolPermissionContext,
  req: PermissionRequest,
  onAsk?: (r: PermissionRequest) => Promise<PermissionDecision>,
): Promise<PermissionDecision> {
  if (ctx.mode === "bypass") return "allow";
  if (!DANGEROUS.has(req.toolName)) return "allow";
  if (ctx.dryRun) return "deny";
  if (onAsk) return onAsk(req);
  return "allow";
}

export function getEmptyToolPermissionContext(): ToolPermissionContext {
  return { mode: "default" };
}
