import { join } from "node:path";
import {
  appendTrace,
  runAgentTurn,
  writeResearchPlan,
} from "../QueryEngine.js";
import type { EnvConfig } from "../env.js";
import {
  type PermissionDecision,
  type PermissionRequest,
  getEmptyToolPermissionContext,
} from "../permissions/index.js";

export type ResearchRunOptions = {
  cwd: string;
  aarRoot: string;
  env: EnvConfig;
  sessionId: string;
  topic: string;
  onStream?: (s: string) => void;
  onTool?: (name: string, summary: string) => void;
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionDecision>;
  signal?: AbortSignal;
};

export async function runResearchWorkflow(
  opt: ResearchRunOptions,
): Promise<{ planPath: string; reply: string }> {
  const steps = [
    "Clarify scope and success criteria",
    "Collect sources (web_search, optional playwright_navigate)",
    "Summarize findings; store key chunks in qdrant_upsert if enabled",
    "If code involved: read_file / write_file / bash tests; log under .aar/experiments/",
    "self_critic then report_write to .aar/reports/",
  ];
  const planPath = await writeResearchPlan(
    opt.cwd,
    opt.aarRoot,
    opt.topic,
    steps,
  );
  await appendTrace(opt.aarRoot, {
    event: "research_start",
    topic: opt.topic,
    planPath,
    t: Date.now(),
  });

  const prompt = [
    `Research topic: ${opt.topic}`,
    `A research plan JSON was written to: ${planPath}`,
    `Project cwd: ${opt.cwd}`,
    `Follow the plan steps. Save raw notes under ${join(opt.aarRoot, "research")} if useful (use write_file into .aar/research/... relative to cwd, e.g. .aar/research/notes.md).`,
    "Finish with report_write (Markdown) in .aar/reports/.",
  ].join("\n");

  const { assistantText } = await runAgentTurn(prompt, {
    cwd: opt.cwd,
    aarRoot: opt.aarRoot,
    env: opt.env,
    sessionId: opt.sessionId,
    permission: getEmptyToolPermissionContext(),
    onStream: opt.onStream,
    onTool: opt.onTool,
    onPermissionRequest: opt.onPermissionRequest,
    signal: opt.signal,
  });

  await appendTrace(opt.aarRoot, {
    event: "research_end",
    topic: opt.topic,
    t: Date.now(),
  });

  return { planPath, reply: assistantText };
}
