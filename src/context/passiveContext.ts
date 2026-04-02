import type { Dirent } from "node:fs";
import { readdir } from "node:fs/promises";
import { join, relative } from "node:path";

async function runCmd(
  cwd: string,
  args: string[],
): Promise<{ ok: boolean; out: string }> {
  const proc = Bun.spawn(args, { cwd, stdout: "pipe", stderr: "pipe" });
  const out = await new Response(proc.stdout).text();
  const err = await new Response(proc.stderr).text();
  const code = await proc.exited;
  const text = (out + (err ? `\n${err}` : "")).trim();
  return { ok: code === 0, out: text };
}

async function gitStatusShort(cwd: string): Promise<string> {
  const r = await runCmd(cwd, ["git", "status", "--short"]);
  if (!r.ok && !r.out) return "(not a git repo or git unavailable)";
  const lines = r.out.split("\n").filter(Boolean).slice(0, 40);
  return lines.length ? lines.join("\n") : "(clean working tree)";
}

async function recentFilesByMtime(
  cwd: string,
  limit: number,
): Promise<string[]> {
  try {
    const scored: { rel: string; mtime: number }[] = [];
    async function walk(dir: string, depth: number) {
      if (depth > 2) return;
      const ents = await readdir(dir, { withFileTypes: true }).catch(
        () => [] as Dirent[],
      );
      for (const e of ents) {
        const full = join(dir, e.name);
        const rel = relative(cwd, full).replace(/\\/g, "/");
        if (rel.startsWith(".aar/") || rel.startsWith(".git/")) continue;
        if (e.isDirectory()) {
          if (e.name === "node_modules" || e.name === "vendor") continue;
          await walk(full, depth + 1);
          continue;
        }
        if (!e.isFile()) continue;
        const st = await Bun.file(full)
          .stat()
          .catch(() => null);
        if (st?.mtime) scored.push({ rel, mtime: st.mtime.getTime() });
      }
    }
    await walk(cwd, 0);
    scored.sort((a, b) => b.mtime - a.mtime);
    const out = scored.slice(0, limit).map((s) => s.rel);
    return out;
  } catch {
    return [];
  }
}

/** Small passive snapshot for system prompt (git + shallow recent files). */
export async function buildPassiveContext(cwd: string): Promise<string> {
  const [gitShort, recent] = await Promise.all([
    gitStatusShort(cwd),
    recentFilesByMtime(cwd, 5),
  ]);
  const recentLines =
    recent.length > 0
      ? recent.map((p) => `- ${p}`).join("\n")
      : "(no files scanned)";
  return [
    "<git_status_short>",
    gitShort,
    "</git_status_short>",
    "<recent_files_mtime>",
    recentLines,
    "</recent_files_mtime>",
  ].join("\n");
}
