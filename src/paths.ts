import { join } from "node:path";

export const AAR_DIR = ".aar";

export function aarRoot(cwd: string): string {
  return join(cwd, AAR_DIR);
}

export const AAR_SUBDIRS = [
  "config",
  "memory/qdrant",
  "memory/neo4j",
  "memory/redis",
  "memory/lsp",
  "research",
  "reports",
  "experiments",
  "plans",
  "traces",
  "logs",
  "skills",
] as const;
