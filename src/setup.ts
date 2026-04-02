import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { AAR_SUBDIRS, aarRoot } from "./paths.js";

export async function ensureAarLayout(cwd: string): Promise<string> {
  const root = aarRoot(cwd);
  await mkdir(root, { recursive: true });
  for (const sub of AAR_SUBDIRS) {
    await mkdir(join(root, sub), { recursive: true });
  }
  return root;
}
