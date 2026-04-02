export type TodoStatus = "pending" | "in_progress" | "completed" | "cancelled";

export type TodoItem = {
  id: string;
  content: string;
  status: TodoStatus;
};

const bySession = new Map<string, Map<string, TodoItem>>();

export function getTodos(sessionId: string): TodoItem[] {
  const m = bySession.get(sessionId);
  if (!m) return [];
  return [...m.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function upsertTodos(
  sessionId: string,
  items: TodoItem[],
  merge: boolean,
): void {
  if (!merge) {
    bySession.set(sessionId, new Map(items.map((i) => [i.id, i])));
    return;
  }
  const m = bySession.get(sessionId) ?? new Map<string, TodoItem>();
  for (const i of items) {
    const prev = m.get(i.id);
    m.set(i.id, { ...prev, ...i, id: i.id });
  }
  bySession.set(sessionId, m);
}

export function clearTodos(sessionId: string): void {
  bySession.delete(sessionId);
}
