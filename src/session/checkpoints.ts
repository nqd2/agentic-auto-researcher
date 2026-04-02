import type { HistoryMessage } from "../history/index.js";

export type UiMsgSnapshot = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export type SessionCheckpoint = {
  history: HistoryMessage[];
  msgs: UiMsgSnapshot[];
};

const stacks = new Map<string, SessionCheckpoint[]>();
const MAX_DEPTH = 30;

export function pushCheckpoint(
  sessionId: string,
  history: HistoryMessage[],
  msgs: UiMsgSnapshot[],
): void {
  const list = stacks.get(sessionId) ?? [];
  list.push({
    history: history.map((h) => ({ ...h })),
    msgs: msgs.map((m) => ({ ...m })),
  });
  while (list.length > MAX_DEPTH) list.shift();
  stacks.set(sessionId, list);
}

export function popCheckpoint(
  sessionId: string,
): SessionCheckpoint | undefined {
  const list = stacks.get(sessionId);
  if (!list?.length) return undefined;
  return list.pop();
}

export function popMany(
  sessionId: string,
  count: number,
): SessionCheckpoint | undefined {
  let last: SessionCheckpoint | undefined;
  for (let i = 0; i < count; i++) {
    const p = popCheckpoint(sessionId);
    if (!p) break;
    last = p;
  }
  return last;
}

export function clearCheckpoints(sessionId: string): void {
  stacks.delete(sessionId);
}

export function checkpointDepth(sessionId: string): number {
  return stacks.get(sessionId)?.length ?? 0;
}
