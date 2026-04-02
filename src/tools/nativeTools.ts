import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";
import { askUserTool } from "./askUser.js";
import { bashTool } from "./bash.js";
import { gitCommitTool } from "./gitCommit.js";
import { gitDiffTool } from "./gitDiff.js";
import { gitShowTool } from "./gitShow.js";
import { grepTool } from "./grep.js";
import { createLspListTool } from "./lspList.js";
import { createNeo4jQueryTool } from "./memoryNeo4j.js";
import {
  createQdrantSearchTool,
  createQdrantUpsertTool,
} from "./memoryQdrant.js";
import { createRedisGetTool, createRedisSetTool } from "./memoryRedis.js";
import { pageIndexTool } from "./pageIndex.js";
import { patchFileTool } from "./patchFile.js";
import { createPlaywrightNavigateTool } from "./playwright.js";
import { readFileTool } from "./readFile.js";
import { reportWriterTool } from "./reportWriter.js";
import { selfCriticTool } from "./selfCritic.js";
import { shellKillTool } from "./shellKill.js";
import { shellStatusTool } from "./shellStatus.js";
import { updateTodosTool } from "./updateTodos.js";
import { webSearchTool } from "./webSearch.js";
import { writeFileTool } from "./writeFile.js";

/** All built-in tools except delegate_task (and except MCP extras). */
export function nativeToolList(getEnv: () => EnvConfig): ToolDefinition[] {
  return [
    bashTool,
    shellStatusTool,
    shellKillTool,
    readFileTool,
    patchFileTool,
    writeFileTool,
    grepTool,
    webSearchTool,
    pageIndexTool,
    selfCriticTool,
    reportWriterTool,
    updateTodosTool,
    askUserTool,
    createPlaywrightNavigateTool(getEnv),
    createQdrantUpsertTool(getEnv),
    createQdrantSearchTool(getEnv),
    createNeo4jQueryTool(getEnv),
    createRedisSetTool(getEnv),
    createRedisGetTool(getEnv),
    createLspListTool(getEnv),
    gitDiffTool,
    gitShowTool,
    gitCommitTool,
  ];
}
