import { getSkillByName, listSkills } from "./loader.js";
import { getActiveSkillNames } from "./sessionState.js";

const BASE = `You are AAR (Agentic Auto-Researcher). You work only inside the user's project directory.
You have tools to read/patch/write files (prefer patch_file for edits; use write_file only for new files or full rewrites), bash (with optional background), shell_status/shell_kill for long commands, update_todos, ask_user, web search, Playwright, memory backends, git diff/show, MCP tools when configured, delegate_task, and report_write to .aar/reports/.
For research tasks: produce a concise plan, gather sources, experiment if needed, then call report_write with a full Markdown report (sections, citations, code snippets where relevant).
Use self_critic before finalizing if uncertain.
Slash commands include /research, /clear, /cost, /skill, /compact, /rewind, /todos.`;

export async function buildSystemPrompt(args: {
  cwd: string;
  aarRoot: string;
  sessionId: string;
}): Promise<string> {
  const skills = await listSkills(args.aarRoot);
  const lines =
    skills.length === 0
      ? "No skills loaded yet. Add Markdown files under .aar/skills/ (optional YAML frontmatter: name, description)."
      : skills
          .map((s) => `- ${s.name}${s.description ? `: ${s.description}` : ""}`)
          .join("\n");

  const active = getActiveSkillNames(args.sessionId);
  const skillBlocks: string[] = [];
  for (const n of active) {
    const sk = await getSkillByName(args.aarRoot, n);
    if (sk) {
      skillBlocks.push(`### Active skill: ${sk.name}\n${sk.body}`);
    }
  }

  const activeSection =
    skillBlocks.length > 0
      ? `\n## Active skills (instructions)\n\n${skillBlocks.join("\n\n")}\n`
      : "";

  return [
    BASE,
    `\n## Available skills (activate with /skill <name>)\n\n${lines}\n`,
    activeSection,
  ].join("");
}

/** Short system prompt for nested sub-agents (saves tokens). */
export const SUBAGENT_SYSTEM =
  "You are a focused sub-agent for AAR. Use only the tools provided. Produce a concise, factual summary for the main agent. If you cannot finish, state what remains.";
