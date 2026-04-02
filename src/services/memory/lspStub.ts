import { readdir } from "node:fs/promises";
import { join } from "node:path";
import type { EnvConfig } from "../../env.js";

/**
 * Lightweight symbol listing without a real LSP process (degraded fast index).
 */
export async function listWorkspaceFiles(
  env: EnvConfig,
  maxFiles = 200,
): Promise<string> {
  const root = env.lspWorkspaceRoot ?? process.cwd();
  const out: string[] = [];
  async function walk(dir: string, depth: number) {
    if (out.length >= maxFiles || depth > 6) return;
    const entries = await readdir(dir, { withFileTypes: true }).catch(() => []);
    for (const e of entries) {
      if (e.name.startsWith(".") || e.name === "node_modules") continue;
      const p = join(dir, e.name);
      if (e.isDirectory()) await walk(p, depth + 1);
      else {
        out.push(p);
        if (out.length >= maxFiles) return;
      }
    }
  }
  await walk(root, 0);
  return out.join("\n");
}
