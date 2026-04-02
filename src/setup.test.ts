import { describe, expect, test } from "bun:test";
import { mkdir, readdir, rm } from "node:fs/promises";
import { join } from "node:path";
import { aarRoot } from "./paths.js";
import {
  checkToolPermission,
  getEmptyToolPermissionContext,
} from "./permissions/index.js";
import { ensureAarLayout } from "./setup.js";

describe("ensureAarLayout", () => {
  test("creates .aar subtree", async () => {
    const base = join(process.cwd(), ".tmp-aar-test", `t-${Date.now()}`);
    await mkdir(base, { recursive: true });
    try {
      const root = await ensureAarLayout(base);
      expect(root).toBe(aarRoot(base));
      const mem = await readdir(join(root, "memory"));
      expect(mem.sort()).toEqual(["lsp", "neo4j", "qdrant", "redis"].sort());
    } finally {
      await rm(base, { recursive: true, force: true });
    }
  });
});

describe("permissions", () => {
  test("allows non-dangerous tools by default", async () => {
    const ctx = getEmptyToolPermissionContext();
    const d = await checkToolPermission(ctx, {
      toolName: "read_file",
      inputSummary: "{}",
    });
    expect(d).toBe("allow");
  });

  test("denies bash in dryRun", async () => {
    const ctx = { ...getEmptyToolPermissionContext(), dryRun: true };
    const d = await checkToolPermission(ctx, {
      toolName: "bash",
      inputSummary: "ls",
    });
    expect(d).toBe("deny");
  });
});
