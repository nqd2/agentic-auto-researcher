export type EnvConfig = {
  providerUrl: string;
  apiKey: string;
  providerStyle: "openai" | "anthropic";
  model: string;
  chromeExecutablePath?: string;
  chromeUserProfile?: string;
  redisUrl?: string;
  qdrantUrl?: string;
  qdrantCollection: string;
  neo4jUri?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
  lspWorkspaceRoot?: string;
};

export function readEnv(): EnvConfig {
  const providerStyle = (Bun.env.PROVIDER_STYLE ?? "openai").toLowerCase();
  return {
    providerUrl: Bun.env.PROVIDER_URL ?? "https://api.openai.com/v1",
    apiKey: Bun.env.API_KEY ?? "",
    providerStyle: providerStyle === "anthropic" ? "anthropic" : "openai",
    model: Bun.env.MODEL ?? "gpt-4o-mini",
    chromeExecutablePath: Bun.env.CHROME_EXECUTABLE_PATH,
    chromeUserProfile: Bun.env.CHROME_USER_PROFILE,
    redisUrl: Bun.env.REDIS_URL,
    qdrantUrl: Bun.env.QDRANT_URL,
    qdrantCollection: Bun.env.QDRANT_COLLECTION ?? "aar_memory",
    neo4jUri: Bun.env.NEO4J_URI,
    neo4jUser: Bun.env.NEO4J_USER,
    neo4jPassword: Bun.env.NEO4J_PASSWORD,
    lspWorkspaceRoot: Bun.env.LSP_WORKSPACE_ROOT,
  };
}
