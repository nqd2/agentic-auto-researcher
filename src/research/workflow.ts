import { randomUUID } from "node:crypto";
import { access } from "node:fs/promises";
import { join } from "node:path";
import {
  appendTrace,
  runAgentTurn,
  runIsolatedAgentTurn,
  writeResearchPlan,
} from "../QueryEngine.js";
import type { EnvConfig } from "../env.js";
import {
  type PermissionRequest,
  type PermissionUiResult,
  type ToolPermissionContext,
  getEmptyToolPermissionContext,
} from "../permissions/index.js";
import type { AskUserRequest } from "../session/askUserTypes.js";
import { REVIEWER_SUBAGENT_SYSTEM } from "./reviewerSystem.js";

/** Relative to project cwd; fixed so review/revise phases can open the draft. */
export const RESEARCH_DRAFT_REL = ".aar/reports/_research_draft.md";

export const RESEARCH_DRAFT_FILENAME = "_research_draft.md";

function finalReportBasename(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
  return `report-${stamp}-${randomUUID().slice(0, 8)}.md`;
}

async function draftExists(aarRoot: string): Promise<boolean> {
  const abs = join(aarRoot, "reports", RESEARCH_DRAFT_FILENAME);
  try {
    await access(abs);
    return true;
  } catch {
    return false;
  }
}

export type ResearchRunOptions = {
  cwd: string;
  aarRoot: string;
  env: EnvConfig;
  sessionId: string;
  topic: string;
  permission?: ToolPermissionContext;
  onStream?: (s: string) => void;
  onTool?: (name: string, summary: string) => void;
  onPermissionRequest?: (req: PermissionRequest) => Promise<PermissionUiResult>;
  signal?: AbortSignal;
  onAskUser?: (req: AskUserRequest) => Promise<string>;
  onTodosUpdated?: () => void;
};

export async function runResearchWorkflow(
  opt: ResearchRunOptions,
): Promise<{ planPath: string; reply: string }> {
  const perm = opt.permission ?? getEmptyToolPermissionContext();
  const steps = [
    "Clarify scope and success criteria",
    "Collect sources (web_search, optional playwright_navigate)",
    "Summarize findings; store key chunks in qdrant_upsert if enabled",
    "If code involved: read_file / patch_file / write_file / bash tests; log under .aar/experiments/",
    `Phase 1: self_critic if useful, then report_write DRAFT only: filename must be exactly "${RESEARCH_DRAFT_FILENAME}" (path under .aar/reports/). This is not the final report.`,
    "Phase 2 (automatic): a reviewer sub-agent will critique the draft.",
    "Phase 3 (automatic): you will revise into the final report_write with a new dated filename.",
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
    draftPath: RESEARCH_DRAFT_REL,
    t: Date.now(),
  });

  const phase1Prompt = [
    `Research topic: ${opt.topic}`,
    `A research plan JSON was written to: ${planPath}`,
    `Project cwd: ${opt.cwd}`,
    `Follow the plan steps. Save raw notes under ${join(opt.aarRoot, "research")} if useful (use write_file into .aar/research/... relative to cwd, e.g. .aar/research/notes.md).`,
    `IMPORTANT — Phase 1 only: When ready to save the report, call report_write with filename exactly "${RESEARCH_DRAFT_FILENAME}" and full Markdown draft content. Do not use any other report filename in this phase. The draft will be reviewed and revised in a later phase.`,
  ].join("\n");

  const engineOpt = {
    cwd: opt.cwd,
    aarRoot: opt.aarRoot,
    env: opt.env,
    sessionId: opt.sessionId,
    permission: perm,
    onStream: opt.onStream,
    onTool: opt.onTool,
    onPermissionRequest: opt.onPermissionRequest,
    signal: opt.signal,
    onAskUser: opt.onAskUser,
    onTodosUpdated: opt.onTodosUpdated,
  };

  const { assistantText: phase1Text } = await runAgentTurn(
    phase1Prompt,
    engineOpt,
  );

  let draftOk = await draftExists(opt.aarRoot);
  if (!draftOk) {
    await appendTrace(opt.aarRoot, {
      event: "research_draft_missing",
      topic: opt.topic,
      expected: RESEARCH_DRAFT_REL,
      t: Date.now(),
    });
    await runAgentTurn(
      [
        `The research draft file was not found at ${RESEARCH_DRAFT_REL} (relative to cwd).`,
        `Topic: ${opt.topic}`,
        `Call report_write once with filename "${RESEARCH_DRAFT_FILENAME}" and put your full draft Markdown in the markdown field. No other filename.`,
      ].join("\n"),
      engineOpt,
    );
    draftOk = await draftExists(opt.aarRoot);
  }

  await appendTrace(opt.aarRoot, {
    event: "research_draft",
    topic: opt.topic,
    ok: draftOk,
    t: Date.now(),
  });

  let critique = "";
  if (draftOk) {
    const reviewerTask = [
      `Research topic: ${opt.topic}`,
      `Draft report path (relative to cwd): ${RESEARCH_DRAFT_REL}`,
      "Read the draft and produce your critique as instructed in your system prompt.",
    ].join("\n");
    critique = await runIsolatedAgentTurn(reviewerTask, {
      ...engineOpt,
      allowedToolNames: ["read_file", "self_critic", "grep"],
      systemPrompt: REVIEWER_SUBAGENT_SYSTEM,
      maxIterations: 12,
    });
    await appendTrace(opt.aarRoot, {
      event: "research_review",
      topic: opt.topic,
      critiqueChars: critique.length,
      t: Date.now(),
    });
  } else {
    critique =
      "(Reviewer skipped: draft file missing after remediation attempt.)";
    await appendTrace(opt.aarRoot, {
      event: "research_review_skipped",
      topic: opt.topic,
      t: Date.now(),
    });
  }

  const finalName = finalReportBasename();
  const critiqueForPrompt =
    critique.length > 16_000
      ? `${critique.slice(0, 16_000)}\n\n…[critique truncated for prompt size]`
      : critique;

  const phase3Prompt = [
    `Research workflow — Phase 3 (final revision). Topic: ${opt.topic}`,
    `Draft path (read with read_file if needed): ${RESEARCH_DRAFT_REL}`,
    draftOk
      ? `Reviewer critique (apply concretely; preserve correct material from the draft):\n\n${critiqueForPrompt}`
      : "No draft on disk; produce the best final report you can from session context and earlier work.",
    `Write the final report with report_write using a NEW filename: "${finalName}" (Markdown under .aar/reports/).`,
    `Phase 1 model output (for context, may be partial):\n${phase1Text.slice(0, 12_000)}${phase1Text.length > 12_000 ? "\n…[truncated]" : ""}`,
  ].join("\n\n");

  const { assistantText: phase3Text } = await runAgentTurn(
    phase3Prompt,
    engineOpt,
  );

  await appendTrace(opt.aarRoot, {
    event: "research_end",
    topic: opt.topic,
    finalSuggestedName: finalName,
    t: Date.now(),
  });

  const reply = [phase1Text, "", "---", "", phase3Text].join("\n");
  return { planPath, reply };
}
