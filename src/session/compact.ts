import type { EnvConfig } from "../env.js";
import { appendHistory, clearHistory, getHistory } from "../history/index.js";
import { type LlmMessage, completeChat } from "../services/llm/client.js";

export async function compactSessionHistory(
  env: EnvConfig,
  sessionId: string,
): Promise<{ summary: string; hadContent: boolean }> {
  const h = getHistory(sessionId);
  if (!h.length) {
    return { summary: "No chat history to compact.", hadContent: false };
  }
  const text = h.map((m) => `${m.role}: ${m.content}`).join("\n\n");
  const summarizePrompt = `Summarize the following chat for continuing a research session. Preserve decisions, URLs, file paths, tool outcomes, and open tasks. Be concise but actionable.

${text}`;

  const messages: LlmMessage[] = [
    { role: "system", content: "You compress research chat transcripts." },
    { role: "user", content: summarizePrompt },
  ];
  const assistant = await completeChat(env, messages, []);

  const summary =
    assistant.content?.trim() || "[model returned no text for summary]";
  clearHistory(sessionId);
  appendHistory(sessionId, {
    role: "user",
    content: "[Prior conversation compacted into summary below]",
  });
  appendHistory(sessionId, { role: "assistant", content: summary });

  return { summary, hadContent: true };
}
