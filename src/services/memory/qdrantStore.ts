import { createHash } from "node:crypto";
import { QdrantClient } from "@qdrant/js-client-rest";
import type { EnvConfig } from "../../env.js";

let client: QdrantClient | null = null;
let failed = false;

function getClient(env: EnvConfig): QdrantClient | null {
  if (!env.qdrantUrl || failed) return null;
  if (!client) {
    try {
      client = new QdrantClient({ url: env.qdrantUrl });
    } catch {
      failed = true;
      return null;
    }
  }
  return client;
}

export async function ensureQdrantCollection(env: EnvConfig): Promise<boolean> {
  const c = getClient(env);
  if (!c) return false;
  try {
    const cols = await c.getCollections();
    const exists = cols.collections.some(
      (x) => x.name === env.qdrantCollection,
    );
    if (!exists) {
      await c.createCollection(env.qdrantCollection, {
        vectors: { size: 384, distance: "Cosine" },
      });
    }
    return true;
  } catch {
    failed = true;
    return false;
  }
}

/** Simple hash embedding placeholder when no embed API — deterministic vector for demo */
function fakeEmbedding(text: string, dim = 384): number[] {
  const h = createHash("sha256").update(text).digest();
  const out: number[] = [];
  for (let i = 0; i < dim; i++) {
    out.push((h[i % h.length] / 255) * 2 - 1);
  }
  return out;
}

function stableNumericId(id: string): number {
  const h = createHash("sha256").update(id).digest();
  const n = h.readUInt32BE(0) % 2_147_000_000;
  return n > 0 ? n : 1;
}

export async function qdrantUpsert(
  env: EnvConfig,
  id: string,
  payload: Record<string, unknown>,
  textForVector: string,
): Promise<string> {
  const ok = await ensureQdrantCollection(env);
  const c = getClient(env);
  if (!ok || !c) return "Qdrant unavailable; skipped upsert.";
  const vector = fakeEmbedding(textForVector);
  const pointId = stableNumericId(id);
  const fullPayload = { ...payload, source_id: id };
  await c.upsert(env.qdrantCollection, {
    wait: true,
    points: [{ id: pointId, vector, payload: fullPayload }],
  });
  return `Upserted point id=${pointId} (source_id=${id})`;
}

export async function qdrantSearch(
  env: EnvConfig,
  queryText: string,
  limit = 5,
): Promise<string> {
  const ok = await ensureQdrantCollection(env);
  const c = getClient(env);
  if (!ok || !c) return "Qdrant unavailable.";
  const vector = fakeEmbedding(queryText);
  const res = await c.search(env.qdrantCollection, {
    vector,
    limit,
    with_payload: true,
  });
  return JSON.stringify(res, null, 2);
}
