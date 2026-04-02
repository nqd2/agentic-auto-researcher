export type ChatRole = "user" | "assistant" | "tool";

export type HistoryMessage = {
  role: ChatRole;
  content: string;
  toolCallId?: string;
  name?: string;
};

const sessions = new Map<string, HistoryMessage[]>();

export function appendHistory(sessionId: string, msg: HistoryMessage): void {
  const list = sessions.get(sessionId) ?? [];
  list.push(msg);
  sessions.set(sessionId, list);
}

export function getHistory(sessionId: string): HistoryMessage[] {
  return [...(sessions.get(sessionId) ?? [])];
}

export function clearHistory(sessionId: string): void {
  sessions.delete(sessionId);
}
