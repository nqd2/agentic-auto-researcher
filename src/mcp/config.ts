import { readFile } from "node:fs/promises";
import { z } from "zod";

const serverSchema = z.object({
  name: z.string().min(1),
  command: z.string().min(1),
  args: z.array(z.string()).optional(),
  env: z.record(z.string()).optional(),
  cwd: z.string().optional(),
});

const fileSchema = z.object({
  servers: z.array(serverSchema),
});

export type McpServerConfig = z.infer<typeof serverSchema>;

export async function loadMcpConfig(
  configPath: string,
): Promise<McpServerConfig[] | null> {
  try {
    const raw = await readFile(configPath, "utf8");
    const parsed = JSON.parse(raw) as unknown;
    const data = fileSchema.parse(parsed);
    return data.servers;
  } catch {
    return null;
  }
}

export function slug(s: string): string {
  return s.replace(/[^a-zA-Z0-9_]/g, "_").slice(0, 48);
}
