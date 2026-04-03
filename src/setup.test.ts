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

  test("alwaysAllow skips prompt for dangerous tools", async () => {
    const alwaysAllow = new Set<string>(["bash"]);
    const ctx = { ...getEmptyToolPermissionContext(), alwaysAllow };
    const d = await checkToolPermission(ctx, {
      toolName: "bash",
      inputSummary: "ls",
    });
    expect(d).toBe("allow");
  });

  test("always_allow from UI adds tool to set", async () => {
    const ctx = getEmptyToolPermissionContext();
    ctx.alwaysAllow = new Set();
    const d = await checkToolPermission(
      ctx,
      { toolName: "bash", inputSummary: "ls" },
      async () => "always_allow",
    );
    expect(d).toBe("allow");
    expect(ctx.alwaysAllow.has("bash")).toBe(true);
  });
});
