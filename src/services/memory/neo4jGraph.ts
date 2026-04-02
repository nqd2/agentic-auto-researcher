import neo4j, { type Driver } from "neo4j-driver";
import type { EnvConfig } from "../../env.js";

let driver: Driver | null = null;
let failed = false;

function getDriver(env: EnvConfig): Driver | null {
  if (!env.neo4jUri || !env.neo4jUser || failed) return null;
  if (!driver) {
    try {
      driver = neo4j.driver(
        env.neo4jUri,
        neo4j.auth.basic(env.neo4jUser, env.neo4jPassword ?? ""),
      );
    } catch {
      failed = true;
      return null;
    }
  }
  return driver;
}

export async function neo4jRun(
  env: EnvConfig,
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<string> {
  const d = getDriver(env);
  if (!d) return "Neo4j unavailable.";
  const session = d.session({ defaultAccessMode: neo4j.session.READ });
  try {
    const result = await session.run(cypher, params);
    const records = result.records.map((r) => r.toObject());
    return JSON.stringify(records, null, 2);
  } catch (e) {
    return `Neo4j error: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await session.close();
  }
}

export async function neo4jWrite(
  env: EnvConfig,
  cypher: string,
  params: Record<string, unknown> = {},
): Promise<string> {
  const d = getDriver(env);
  if (!d) return "Neo4j unavailable.";
  const session = d.session({ defaultAccessMode: neo4j.session.WRITE });
  try {
    const result = await session.run(cypher, params);
    return `OK, records: ${result.records.length}`;
  } catch (e) {
    return `Neo4j error: ${e instanceof Error ? e.message : String(e)}`;
  } finally {
    await session.close();
  }
}
