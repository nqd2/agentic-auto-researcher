import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { neo4jRun } from "../services/memory/neo4jGraph.js";

const schema = z.object({
  cypher: z.string().describe("Read-only Cypher query"),
});

export function createNeo4jQueryTool(getEnv: () => EnvConfig): ToolDefinition {
  return {
    name: "neo4j_query",
    description: "Run a read-only Cypher query against Neo4j (no writes).",
    zodSchema: schema,
    inputSchema: {
      type: "object",
      properties: { cypher: { type: "string" } },
      required: ["cypher"],
    },
    async execute(raw) {
      const input = schema.parse(raw);
      const upper = input.cypher.toUpperCase();
      if (
        upper.includes("CREATE") ||
        upper.includes("DELETE") ||
        upper.includes("DETACH") ||
        upper.includes("MERGE") ||
        upper.includes("SET ") ||
        upper.includes("REMOVE")
      ) {
        return "Denied: only read queries allowed from this tool.";
      }
      return neo4jRun(getEnv(), input.cypher);
    },
  };
}
