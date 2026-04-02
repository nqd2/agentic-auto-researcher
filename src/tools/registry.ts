import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { bashTool } from "./bash.js";
import { gitCommitTool } from "./gitCommit.js";
import { grepTool } from "./grep.js";
import { createLspListTool } from "./lspList.js";
import { createNeo4jQueryTool } from "./memoryNeo4j.js";
import {
  createQdrantSearchTool,
  createQdrantUpsertTool,
} from "./memoryQdrant.js";
import { createRedisGetTool, createRedisSetTool } from "./memoryRedis.js";
import { pageIndexTool } from "./pageIndex.js";
import { createPlaywrightNavigateTool } from "./playwright.js";
import { readFileTool } from "./readFile.js";
import { reportWriterTool } from "./reportWriter.js";
import { selfCriticTool } from "./selfCritic.js";
import { webSearchTool } from "./webSearch.js";
import { writeFileTool } from "./writeFile.js";

export function buildToolRegistry(getEnv: () => EnvConfig): ToolDefinition[] {
  return [
    bashTool,
    readFileTool,
    writeFileTool,
    grepTool,
    webSearchTool,
    pageIndexTool,
    selfCriticTool,
    reportWriterTool,
    createPlaywrightNavigateTool(getEnv),
    createQdrantUpsertTool(getEnv),
    createQdrantSearchTool(getEnv),
    createNeo4jQueryTool(getEnv),
    createRedisSetTool(getEnv),
    createRedisGetTool(getEnv),
    createLspListTool(getEnv),
    gitCommitTool,
  ];
}

export function toolMap(
  registry: ToolDefinition[],
): Map<string, ToolDefinition> {
  return new Map(registry.map((t) => [t.name, t]));
}
