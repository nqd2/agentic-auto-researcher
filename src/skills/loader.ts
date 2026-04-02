import { readFile, readdir } from "node:fs/promises";
import { join } from "node:path";

export type SkillFile = {
  name: string;
  description: string;
  body: string;
  filePath: string;
};

function parseFrontmatter(raw: string): {
  meta: Record<string, string>;
  body: string;
} {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith("---\n")) {
    return { meta: {}, body: raw.trim() };
  }
  const end = trimmed.indexOf("\n---\n", 4);
  if (end === -1) {
    return { meta: {}, body: raw.trim() };
  }
  const fmBlock = trimmed.slice(4, end);
  const body = trimmed.slice(end + 5);
  const meta: Record<string, string> = {};
  for (const line of fmBlock.split("\n")) {
    const m = line.match(/^([\w-]+):\s*(.*)$/);
    if (m) meta[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
  return { meta, body: body.trim() };
}

export async function listSkills(aarRoot: string): Promise<SkillFile[]> {
  const dir = join(aarRoot, "skills");
  let names: string[] = [];
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const out: SkillFile[] = [];
  for (const f of names.sort()) {
    if (!f.endsWith(".md")) continue;
    const filePath = join(dir, f);
    const raw = await readFile(filePath, "utf8");
    const { meta, body } = parseFrontmatter(raw);
    const name =
      meta.name || f.replace(/\.md$/i, "").replace(/\s+/g, "-").toLowerCase();
    const description = meta.description ?? meta.when_to_use ?? "";
    out.push({ name, description, body, filePath });
  }
  return out;
}

export async function getSkillByName(
  aarRoot: string,
  name: string,
): Promise<SkillFile | null> {
  const all = await listSkills(aarRoot);
  const lower = name.toLowerCase();
  return (
    all.find((s) => s.name.toLowerCase() === lower) ??
    all.find((s) => s.name.toLowerCase().replace(/\s+/g, "-") === lower) ??
    null
  );
}
