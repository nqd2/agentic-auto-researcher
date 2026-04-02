import { join } from "node:path";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import type { ToolDefinition } from "../Tool.js";
import { type McpServerConfig, loadMcpConfig } from "./config.js";
import { mcpToolToDefinition } from "./tools.js";

type Session = {
  client: Client;
  transport: StdioClientTransport;
};

export class McpConnectionManager {
  private sessions: Session[] = [];
  private tools: ToolDefinition[] = [];

  getTools(): ToolDefinition[] {
    return this.tools;
  }

  async connectFromAarRoot(aarRoot: string): Promise<void> {
    await this.closeAll();
    const path = join(aarRoot, "mcp.json");
    const servers = await loadMcpConfig(path);
    if (!servers?.length) return;

    const defs: ToolDefinition[] = [];
    const sessions: Session[] = [];

    for (const s of servers) {
      try {
        const { client, transport } = await this.connectServer(s);
        sessions.push({ client, transport });
        const listed = await client.listTools();
        for (const t of listed.tools ?? []) {
          defs.push(
            mcpToolToDefinition(
              s.name,
              t.name,
              t.description,
              t.inputSchema,
              client,
            ),
          );
        }
      } catch (e) {
        console.error(
          `[mcp] server «${s.name}» failed:`,
          e instanceof Error ? e.message : e,
        );
      }
    }

    this.sessions = sessions;
    this.tools = defs;
  }

  private async connectServer(
    s: McpServerConfig,
  ): Promise<{ client: Client; transport: StdioClientTransport }> {
    const transport = new StdioClientTransport({
      command: s.command,
      args: s.args ?? [],
      env: s.env,
      cwd: s.cwd,
      stderr: "inherit",
    });
    const client = new Client(
      { name: "agentic-auto-researcher", version: "0.1.0" },
      { capabilities: {} },
    );
    await client.connect(transport);
    return { client, transport };
  }

  async closeAll(): Promise<void> {
    for (const s of this.sessions) {
      try {
        await s.client.close();
      } catch {
        /* ignore */
      }
      try {
        await s.transport.close();
      } catch {
        /* ignore */
      }
    }
    this.sessions = [];
    this.tools = [];
  }
}
