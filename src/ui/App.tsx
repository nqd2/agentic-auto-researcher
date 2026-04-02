import { randomUUID } from "node:crypto";
import { Box, Text, useInput } from "ink";
import TextInput from "ink-text-input";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { runAgentTurn } from "../QueryEngine.js";
import { getUsageTotals, resetUsage } from "../cost/index.js";
import type { EnvConfig } from "../env.js";
import { appendHistory, clearHistory, getHistory } from "../history/index.js";
import {
  type PermissionDecision,
  type PermissionRequest,
  getEmptyToolPermissionContext,
} from "../permissions/index.js";
import { runResearchWorkflow } from "../research/workflow.js";
import type {
  AskUserQuestion,
  AskUserRequest,
} from "../session/askUserTypes.js";
import {
  checkpointDepth,
  clearCheckpoints,
  popMany,
  pushCheckpoint,
} from "../session/checkpoints.js";
import { compactSessionHistory } from "../session/compact.js";
import { clearTodos, getTodos } from "../session/todos.js";
import { getSkillByName, listSkills } from "../skills/loader.js";
import {
  addActiveSkill,
  clearActiveSkills,
  getActiveSkillNames,
} from "../skills/sessionState.js";
import { CC_DARK } from "./cc/theme.js";
import { useDoublePress } from "./hooks/useDoublePress.js";

type Msg = {
  id: string;
  role: "user" | "assistant" | "system";
  text: string;
};

export type AppProps = {
  cwd: string;
  aarRoot: string;
  env: EnvConfig;
  sessionId: string;
  initialTopic?: string;
};

type Overlay =
  | {
      kind: "permission";
      req: PermissionRequest;
      choice: 0 | 1;
    }
  | {
      kind: "messageSelector";
      options: Array<{ id: string; text: string }>;
      selectedIndex: number;
    };

type AskFlowState = {
  title?: string;
  questions: AskUserQuestion[];
  qIdx: number;
  step: "mcq" | "text";
  focusIdx: number;
  selectedIds: string[];
  textDraft: string;
  answers: Record<string, unknown>;
  pendingMcq?: string | string[];
};

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];

function isAbortError(e: unknown): boolean {
  return e instanceof DOMException && e.name === "AbortError";
}

export function App(props: AppProps) {
  const [, forceRedraw] = useState(0);
  const [input, setInput] = useState("");
  const [msgs, setMsgs] = useState<Msg[]>([
    {
      id: randomUUID(),
      role: "system",
      text: `cwd: ${props.cwd}`,
    },
  ]);
  const [busy, setBusy] = useState(false);
  const [lastTool, setLastTool] = useState("");
  const [showTranscript, setShowTranscript] = useState(true);
  const [overlay, setOverlay] = useState<Overlay | null>(null);
  const [askFlow, setAskFlow] = useState<AskFlowState | null>(null);
  const [todos, setTodos] = useState(() => getTodos(props.sessionId));
  const [spinIdx, setSpinIdx] = useState(0);

  const [exitPendingC, setExitPendingC] = useState(false);
  const [exitPendingD, setExitPendingD] = useState(false);

  const permissionResolverRef = useRef<
    ((d: PermissionDecision) => void) | null
  >(null);
  const askResolveRef = useRef<((s: string) => void) | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputHistoryRef = useRef<string[]>([]);
  const historyCursorRef = useRef<number | null>(null);

  const push = useCallback((m: Omit<Msg, "id">) => {
    setMsgs((prev) => [...prev, { ...m, id: randomUUID() }]);
  }, []);

  const userMessages = useMemo(
    () => msgs.filter((m) => m.role === "user"),
    [msgs],
  );

  useEffect(() => {
    if (!todos.some((t) => t.status === "in_progress")) return undefined;
    const id = setInterval(() => setSpinIdx((i) => i + 1), 400);
    return () => clearInterval(id);
  }, [todos]);

  const closeOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

  const onAskUser = useCallback((req: AskUserRequest) => {
    return new Promise<string>((resolve) => {
      askResolveRef.current = resolve;
      const first = req.questions[0];
      if (!first) {
        resolve(JSON.stringify({ error: "no questions" }));
        return;
      }
      setAskFlow({
        title: req.title,
        questions: req.questions,
        qIdx: 0,
        step: first.options?.length ? "mcq" : "text",
        focusIdx: 0,
        selectedIds: [],
        textDraft: "",
        answers: {},
      });
    });
  }, []);

  const onTodosUpdated = useCallback(() => {
    setTodos(getTodos(props.sessionId));
  }, [props.sessionId]);

  const onPermissionRequest = useCallback(
    (req: PermissionRequest): Promise<PermissionDecision> => {
      return new Promise((resolve) => {
        permissionResolverRef.current = resolve;
        setOverlay({ kind: "permission", req, choice: 0 });
      });
    },
    [],
  );

  const exitApp = useCallback(() => {
    process.exit(0);
  }, []);

  const doublePressExitC = useDoublePress(setExitPendingC, exitApp);
  const doublePressExitD = useDoublePress(setExitPendingD, exitApp);

  const tryInterruptAgent = useCallback((): boolean => {
    const ac = abortRef.current;
    if (ac && !ac.signal.aborted) {
      ac.abort();
      return true;
    }
    return false;
  }, []);

  const sendText = useCallback(
    async (rawText: string) => {
      const v = rawText.trim();
      if (!v || busy || overlay || askFlow) return;

      if (inputHistoryRef.current[inputHistoryRef.current.length - 1] !== v) {
        inputHistoryRef.current.push(v);
        if (inputHistoryRef.current.length > 100) {
          inputHistoryRef.current.shift();
        }
      }
      historyCursorRef.current = null;

      setInput("");
      setBusy(true);
      setLastTool("");

      if (v === "/clear") {
        if (askResolveRef.current) {
          askResolveRef.current(JSON.stringify({ cancelled: true }));
          askResolveRef.current = null;
        }
        setAskFlow(null);
        clearHistory(props.sessionId);
        clearCheckpoints(props.sessionId);
        clearActiveSkills(props.sessionId);
        clearTodos(props.sessionId);
        setTodos([]);
        setMsgs([
          {
            id: randomUUID(),
            role: "system",
            text: `cwd: ${props.cwd} (session cleared)`,
          },
        ]);
        setBusy(false);
        return;
      }

      if (v === "/cost" || v.startsWith("/cost ")) {
        const rest = v === "/cost" ? "" : v.slice("/cost ".length).trim();
        if (rest === "reset") resetUsage();
        const u = getUsageTotals();
        push({
          role: "user",
          text: v,
        });
        push({
          role: "assistant",
          text:
            rest === "reset"
              ? `Usage counters reset.\nIn: ${u.promptTokens} tokens · Out: ${u.completionTokens} · ~$${u.totalCostUsd.toFixed(4)}`
              : `Session usage (approx):\nIn: ${u.promptTokens} tokens\nOut: ${u.completionTokens} tokens\n~$${u.totalCostUsd.toFixed(4)}\n\nUse /cost reset to zero counters.`,
        });
        setBusy(false);
        return;
      }

      if (v === "/skill" || v.startsWith("/skill ")) {
        const rest = v === "/skill" ? "" : v.slice("/skill ".length).trim();
        push({ role: "user", text: v });
        if (!rest || rest === "list") {
          const skills = await listSkills(props.aarRoot);
          const active = getActiveSkillNames(props.sessionId);
          const lines =
            skills.length === 0
              ? "No skills in .aar/skills/ yet."
              : skills
                  .map(
                    (s) =>
                      `- ${s.name}${s.description ? ` — ${s.description}` : ""}`,
                  )
                  .join("\n");
          push({
            role: "assistant",
            text: `Skills:\n${lines}\n\nActive: ${active.length ? active.join(", ") : "(none)"}\n\nUse /skill <name> to activate. /skill clear removes active skills.`,
          });
        } else if (rest === "clear") {
          clearActiveSkills(props.sessionId);
          push({
            role: "assistant",
            text: "Active skills cleared for this session.",
          });
        } else {
          const sk = await getSkillByName(props.aarRoot, rest);
          if (!sk) {
            push({
              role: "assistant",
              text: `Unknown skill «${rest}». Use /skill list.`,
            });
          } else {
            addActiveSkill(props.sessionId, sk.name);
            push({
              role: "assistant",
              text: `Skill «${sk.name}» added to active stack for this session.`,
            });
          }
        }
        setBusy(false);
        return;
      }

      if (v === "/todos") {
        push({ role: "user", text: v });
        const list = getTodos(props.sessionId);
        push({
          role: "assistant",
          text:
            list.length === 0
              ? "No todos yet. The model can use update_todos."
              : list
                  .map(
                    (t) =>
                      `- [${t.status}] ${t.id}: ${t.content.slice(0, 200)}`,
                  )
                  .join("\n"),
        });
        setBusy(false);
        return;
      }

      if (v === "/rewind" || v.startsWith("/rewind ")) {
        const n =
          v === "/rewind"
            ? 1
            : Math.max(1, Number.parseInt(v.slice(8).trim(), 10) || 1);
        const depth = checkpointDepth(props.sessionId);
        if (depth === 0) {
          push({ role: "user", text: v });
          push({
            role: "assistant",
            text: "No checkpoints to rewind (send a message to the model first).",
          });
          setBusy(false);
          return;
        }
        const steps = Math.min(n, depth);
        const cp = popMany(props.sessionId, steps);
        if (!cp) {
          push({ role: "user", text: v });
          push({ role: "assistant", text: "Rewind failed." });
          setBusy(false);
          return;
        }
        clearHistory(props.sessionId);
        for (const m of cp.history) {
          appendHistory(props.sessionId, m);
        }
        const rest = checkpointDepth(props.sessionId);
        setMsgs([
          ...cp.msgs.map((m) => ({
            ...m,
            id: randomUUID(),
          })),
          { id: randomUUID(), role: "user", text: v },
          {
            id: randomUUID(),
            role: "assistant",
            text: `Restored state (${steps} step(s) back). ${rest} checkpoint(s) remaining.`,
          },
        ]);
        setBusy(false);
        return;
      }

      if (v === "/compact") {
        push({ role: "user", text: v });
        if (!props.env.aarAllowCompact) {
          push({
            role: "assistant",
            text: "Set AAR_ALLOW_COMPACT=true in .env to enable /compact (uses one extra model call).",
          });
          setBusy(false);
          return;
        }
        if (!props.env.apiKey) {
          push({ role: "assistant", text: "Set API_KEY in .env first." });
          setBusy(false);
          return;
        }
        try {
          const { summary, hadContent } = await compactSessionHistory(
            props.env,
            props.sessionId,
          );
          clearCheckpoints(props.sessionId);
          setMsgs([
            {
              id: randomUUID(),
              role: "system",
              text: `cwd: ${props.cwd}`,
            },
            { id: randomUUID(), role: "user", text: "/compact" },
            {
              id: randomUUID(),
              role: "assistant",
              text: hadContent ? `Session compacted.\n\n${summary}` : summary,
            },
          ]);
        } catch (e) {
          push({
            role: "assistant",
            text: `Compact failed: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
        setBusy(false);
        return;
      }

      pushCheckpoint(props.sessionId, getHistory(props.sessionId), msgs);
      push({ role: "user", text: v });

      if (!props.env.apiKey) {
        push({ role: "assistant", text: "Set API_KEY in .env first." });
        setBusy(false);
        return;
      }

      const ac = new AbortController();
      abortRef.current = ac;

      try {
        if (v.startsWith("/research ")) {
          const topic = v.slice("/research ".length).trim();
          let acc = "";
          const { reply } = await runResearchWorkflow({
            cwd: props.cwd,
            aarRoot: props.aarRoot,
            env: props.env,
            sessionId: props.sessionId,
            topic,
            onStream: (s) => {
              acc += s;
            },
            onTool: (n, s) => setLastTool(`${n}: ${s}`),
            onPermissionRequest,
            signal: ac.signal,
            onAskUser,
            onTodosUpdated,
          });
          push({ role: "assistant", text: acc || reply });
          return;
        }

        let acc = "";
        const { assistantText } = await runAgentTurn(v, {
          cwd: props.cwd,
          aarRoot: props.aarRoot,
          env: props.env,
          sessionId: props.sessionId,
          permission: getEmptyToolPermissionContext(),
          onStream: (s) => {
            acc += s;
          },
          onTool: (n, s) => setLastTool(`${n}: ${s}`),
          onPermissionRequest,
          signal: ac.signal,
          onAskUser,
          onTodosUpdated,
        });
        push({ role: "assistant", text: acc || assistantText });
      } catch (e) {
        if (isAbortError(e)) {
          push({ role: "assistant", text: "[Interrupted]" });
        } else {
          push({
            role: "assistant",
            text: `Error: ${e instanceof Error ? e.message : String(e)}`,
          });
        }
      } finally {
        abortRef.current = null;
        setBusy(false);
      }
    },
    [
      askFlow,
      busy,
      msgs,
      onAskUser,
      onPermissionRequest,
      onTodosUpdated,
      overlay,
      props,
      push,
    ],
  );

  const submitAskText = useCallback(() => {
    setAskFlow((prev) => {
      if (!prev || prev.step !== "text") return prev;
      const q = prev.questions[prev.qIdx];
      if (!q) return prev;
      let value: unknown = prev.textDraft;
      if (prev.pendingMcq !== undefined) {
        value = { picked: prev.pendingMcq, text: prev.textDraft };
      }
      const answers = { ...prev.answers, [q.id]: value };
      if (prev.qIdx + 1 >= prev.questions.length) {
        Promise.resolve().then(() => {
          askResolveRef.current?.(JSON.stringify({ answers }));
          askResolveRef.current = null;
          setAskFlow(null);
        });
        return null;
      }
      const nq = prev.questions[prev.qIdx + 1];
      return {
        ...prev,
        qIdx: prev.qIdx + 1,
        step: nq.options?.length ? "mcq" : "text",
        focusIdx: 0,
        selectedIds: [],
        textDraft: "",
        answers,
        pendingMcq: undefined,
      };
    });
  }, []);

  const openMessageSelector = useCallback(() => {
    const options = userMessages.slice(-12).map((m) => ({
      id: m.id,
      text: m.text,
    }));
    if (options.length === 0) return;
    setOverlay({
      kind: "messageSelector",
      options,
      selectedIndex: options.length - 1,
    });
  }, [userMessages]);

  useInput((ch: string, key: Record<string, boolean | undefined>) => {
    const ctrl = Boolean(key.ctrl);
    const shift = Boolean(key.shift);
    const meta = Boolean(key.meta);

    if (askFlow) {
      if (key.escape) {
        askResolveRef.current?.(JSON.stringify({ cancelled: true }));
        askResolveRef.current = null;
        setAskFlow(null);
        return;
      }
      if (askFlow.step === "text") {
        return;
      }
      const q = askFlow.questions[askFlow.qIdx];
      const opts = q?.options;
      if (!opts?.length) {
        return;
      }
      if (key.upArrow || ch === "k" || (ctrl && ch === "p")) {
        setAskFlow((p) =>
          p && p.step === "mcq"
            ? { ...p, focusIdx: Math.max(0, p.focusIdx - 1) }
            : p,
        );
        return;
      }
      if (key.downArrow || ch === "j" || (ctrl && ch === "n")) {
        setAskFlow((p) => {
          if (!p || p.step !== "mcq") return p;
          const o = p.questions[p.qIdx]?.options ?? [];
          return {
            ...p,
            focusIdx: Math.min(o.length - 1, p.focusIdx + 1),
          };
        });
        return;
      }
      if (ch === " " && q.allow_multiple) {
        setAskFlow((p) => {
          if (!p || p.step !== "mcq") return p;
          const o = p.questions[p.qIdx]?.options ?? [];
          const id = o[p.focusIdx]?.id;
          if (!id) return p;
          const has = p.selectedIds.includes(id);
          const selectedIds = has
            ? p.selectedIds.filter((x) => x !== id)
            : [...p.selectedIds, id];
          return { ...p, selectedIds };
        });
        return;
      }
      if (key.return || key.enter) {
        setAskFlow((prev) => {
          if (!prev || prev.step !== "mcq") return prev;
          const qq = prev.questions[prev.qIdx];
          const o = qq.options ?? [];
          let pick: string | string[];
          if (qq.allow_multiple) {
            if (prev.selectedIds.length === 0) return prev;
            pick = [...prev.selectedIds];
          } else {
            const one = o[prev.focusIdx]?.id;
            if (!one) return prev;
            pick = one;
          }
          if (!qq.allow_free_text) {
            const answers = { ...prev.answers, [qq.id]: pick };
            if (prev.qIdx + 1 >= prev.questions.length) {
              Promise.resolve().then(() => {
                askResolveRef.current?.(JSON.stringify({ answers }));
                askResolveRef.current = null;
                setAskFlow(null);
              });
              return null;
            }
            const nq = prev.questions[prev.qIdx + 1];
            return {
              ...prev,
              qIdx: prev.qIdx + 1,
              step: nq.options?.length ? "mcq" : "text",
              focusIdx: 0,
              selectedIds: [],
              textDraft: "",
              answers,
              pendingMcq: undefined,
            };
          }
          return {
            ...prev,
            step: "text",
            pendingMcq: pick,
            textDraft: "",
          };
        });
        return;
      }
      return;
    }

    if (key.escape) {
      if (overlay?.kind === "permission") {
        permissionResolverRef.current?.("deny");
        permissionResolverRef.current = null;
      }
      closeOverlay();
      return;
    }

    if (ctrl && ch === "l") {
      forceRedraw((n) => n + 1);
      return;
    }

    if (ctrl && ch === "o") {
      setShowTranscript((x) => !x);
      return;
    }

    if (ctrl && ch === "r" && !overlay && !askFlow) {
      openMessageSelector();
      return;
    }

    if (ctrl && ch === "c") {
      if (overlay?.kind === "permission") {
        permissionResolverRef.current?.("deny");
        permissionResolverRef.current = null;
        closeOverlay();
        return;
      }
      if (overlay?.kind === "messageSelector") {
        closeOverlay();
        return;
      }
      if (askFlow) {
        askResolveRef.current?.(JSON.stringify({ cancelled: true }));
        askResolveRef.current = null;
        setAskFlow(null);
        return;
      }
      if (tryInterruptAgent()) return;
      doublePressExitC();
      return;
    }

    if (ctrl && ch === "d") {
      doublePressExitD();
      return;
    }

    if (overlay?.kind === "permission") {
      if (key.upArrow || ch === "k" || (ctrl && ch === "p")) {
        setOverlay((prev) =>
          prev?.kind === "permission" ? { ...prev, choice: 0 } : prev,
        );
        return;
      }
      if (key.downArrow || ch === "j" || (ctrl && ch === "n")) {
        setOverlay((prev) =>
          prev?.kind === "permission" ? { ...prev, choice: 1 } : prev,
        );
        return;
      }
      if (key.return || key.enter) {
        const d = overlay.choice === 0 ? "allow" : "deny";
        permissionResolverRef.current?.(d);
        permissionResolverRef.current = null;
        closeOverlay();
      }
      return;
    }

    if (overlay?.kind === "messageSelector") {
      const sel = (delta: number) => {
        setOverlay((prev) => {
          if (!prev || prev.kind !== "messageSelector") return prev;
          const next = Math.max(
            0,
            Math.min(prev.options.length - 1, prev.selectedIndex + delta),
          );
          return { ...prev, selectedIndex: next };
        });
      };
      if (key.upArrow || ch === "k" || (ctrl && ch === "p")) {
        sel(-1);
        return;
      }
      if (key.downArrow || ch === "j" || (ctrl && ch === "n")) {
        sel(1);
        return;
      }
      if (
        (ctrl && key.upArrow) ||
        (shift && key.upArrow) ||
        (meta && key.upArrow) ||
        (shift && ch === "k")
      ) {
        setOverlay((prev) =>
          prev?.kind === "messageSelector"
            ? { ...prev, selectedIndex: 0 }
            : prev,
        );
        return;
      }
      if (
        (ctrl && key.downArrow) ||
        (shift && key.downArrow) ||
        (meta && key.downArrow) ||
        (shift && ch === "j")
      ) {
        setOverlay((prev) =>
          prev?.kind === "messageSelector"
            ? {
                ...prev,
                selectedIndex: Math.max(0, prev.options.length - 1),
              }
            : prev,
        );
        return;
      }
      if (key.return || key.enter) {
        const opt = overlay.options[overlay.selectedIndex];
        if (opt) {
          closeOverlay();
          void sendText(opt.text);
        }
      }
      return;
    }

    if (!overlay && !busy && !askFlow) {
      if (key.escape) {
        setInput("");
        historyCursorRef.current = null;
        return;
      }
      if (key.upArrow) {
        const hist = inputHistoryRef.current;
        if (hist.length === 0) return;
        const cur =
          historyCursorRef.current === null
            ? hist.length - 1
            : Math.max(0, historyCursorRef.current - 1);
        historyCursorRef.current = cur;
        setInput(hist[cur] ?? "");
        return;
      }
      if (key.downArrow) {
        const hist = inputHistoryRef.current;
        if (hist.length === 0) return;
        if (historyCursorRef.current === null) return;
        const cur = Math.min(hist.length - 1, historyCursorRef.current + 1);
        historyCursorRef.current = cur;
        setInput(hist[cur] ?? "");
        if (cur === hist.length - 1) historyCursorRef.current = null;
        return;
      }
    }
  });

  const seeded = useRef(false);
  useEffect(() => {
    if (seeded.current || !props.initialTopic) return;
    seeded.current = true;
    void sendText(`/research ${props.initialTopic}`);
  }, [props.initialTopic, sendText]);

  const usage = getUsageTotals();

  return (
    <Box flexDirection="column" padding={1} width="100%">
      <Box flexDirection="row" justifyContent="space-between">
        <Text color={CC_DARK.brand} bold>
          AAR
        </Text>
        <Text color={CC_DARK.inactive}>
          in {usage.promptTokens} / out {usage.completionTokens} · ~$
          {usage.totalCostUsd.toFixed(4)}
        </Text>
      </Box>

      {todos.length > 0 ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="round"
          borderColor={CC_DARK.subtle}
          paddingX={1}
        >
          <Text bold color={CC_DARK.brand}>
            Todos
          </Text>
          {todos.map((t) => {
            const spin =
              t.status === "in_progress"
                ? `${SPINNER_FRAMES[spinIdx % SPINNER_FRAMES.length]} `
                : "";
            const mark =
              t.status === "completed"
                ? "✓ "
                : t.status === "cancelled"
                  ? "✗ "
                  : t.status === "in_progress"
                    ? spin
                    : "○ ";
            return (
              <Text key={t.id} color={CC_DARK.text} wrap="wrap">
                {mark}
                {t.content}
              </Text>
            );
          })}
        </Box>
      ) : null}

      <Box flexDirection="column" marginTop={1} flexGrow={1}>
        {msgs.slice(-40).map((m) => (
          <Box
            key={m.id}
            flexDirection="column"
            marginBottom={1}
            paddingX={1}
            paddingY={m.role === "user" ? 1 : 0}
            borderStyle={m.role === "user" ? "round" : undefined}
            borderColor={m.role === "user" ? CC_DARK.promptBorder : undefined}
          >
            <Text
              color={
                m.role === "system"
                  ? CC_DARK.subtle
                  : m.role === "user"
                    ? CC_DARK.clawd_body
                    : CC_DARK.brand
              }
            >
              {m.role === "system"
                ? "system"
                : m.role === "user"
                  ? "You"
                  : "Assistant"}
            </Text>
            <Text
              color={CC_DARK.text}
              backgroundColor={
                m.role === "user" ? CC_DARK.userMessageBackground : undefined
              }
              wrap="wrap"
            >
              {m.text}
            </Text>
          </Box>
        ))}
      </Box>

      {showTranscript && lastTool ? (
        <Box
          marginTop={1}
          paddingX={1}
          paddingY={1}
          borderStyle="round"
          borderColor={CC_DARK.subtle}
        >
          <Text
            color={CC_DARK.inactive}
            backgroundColor={CC_DARK.bashMessageBackgroundColor}
            wrap="wrap"
          >
            {lastTool}
          </Text>
        </Box>
      ) : null}

      {busy ? (
        <Text color={CC_DARK.warning}>Working… (Ctrl+C to interrupt)</Text>
      ) : null}

      {(exitPendingC || exitPendingD) && !busy ? (
        <Text color={CC_DARK.inactive} italic>
          Press {exitPendingC ? "Ctrl+C" : "Ctrl+D"} again to exit
        </Text>
      ) : null}

      {overlay?.kind === "permission" ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={CC_DARK.permission}
          padding={1}
          marginTop={1}
        >
          <Text bold color={CC_DARK.permission}>
            Permission required
          </Text>
          <Text color={CC_DARK.inactive}>Tool: {overlay.req.toolName}</Text>
          <Text color={CC_DARK.subtle} wrap="wrap">
            {overlay.req.inputSummary.slice(0, 400)}
            {overlay.req.inputSummary.length > 400 ? "…" : ""}
          </Text>
          <Box flexDirection="column" marginTop={1}>
            <Text
              color={overlay.choice === 0 ? CC_DARK.text : CC_DARK.inactive}
            >
              {overlay.choice === 0 ? "> " : "  "}Allow
            </Text>
            <Text
              color={overlay.choice === 1 ? CC_DARK.text : CC_DARK.inactive}
            >
              {overlay.choice === 1 ? "> " : "  "}Deny
            </Text>
          </Box>
          <Text color={CC_DARK.subtle} italic>
            Enter · j/k · Esc = deny
          </Text>
        </Box>
      ) : null}

      {overlay?.kind === "messageSelector" ? (
        <Box
          flexDirection="column"
          borderStyle="single"
          borderColor={CC_DARK.suggestion}
          padding={1}
          marginTop={1}
        >
          <Text bold color={CC_DARK.suggestion}>
            History search
          </Text>
          <Text color={CC_DARK.subtle}>↑/↓ j/k · Enter · Esc</Text>
          <Box flexDirection="column" marginTop={1}>
            {overlay.options.map((opt, idx) => (
              <Text
                key={opt.id}
                color={
                  idx === overlay.selectedIndex
                    ? CC_DARK.text
                    : CC_DARK.inactive
                }
                wrap="wrap"
              >
                {idx === overlay.selectedIndex ? "> " : "  "}
                {opt.text.slice(0, 200)}
                {opt.text.length > 200 ? "…" : ""}
              </Text>
            ))}
          </Box>
        </Box>
      ) : null}

      {askFlow ? (
        <Box
          flexDirection="column"
          marginTop={1}
          borderStyle="single"
          borderColor={CC_DARK.suggestion}
          paddingX={1}
        >
          {askFlow.title ? (
            <Text bold color={CC_DARK.suggestion}>
              {askFlow.title}
            </Text>
          ) : null}
          <Text color={CC_DARK.text} wrap="wrap">
            {askFlow.questions[askFlow.qIdx]?.prompt ?? ""}
          </Text>
          {askFlow.step === "mcq" &&
          (askFlow.questions[askFlow.qIdx]?.options?.length ?? 0) > 0 ? (
            <Box flexDirection="column" marginTop={1}>
              {(askFlow.questions[askFlow.qIdx]?.options ?? []).map((o, i) => {
                const multi =
                  askFlow.questions[askFlow.qIdx]?.allow_multiple ?? false;
                const picked =
                  multi && askFlow.selectedIds.includes(o.id) ? "* " : "  ";
                const cur = i === askFlow.focusIdx ? "> " : "  ";
                return (
                  <Text
                    key={o.id}
                    color={
                      i === askFlow.focusIdx ? CC_DARK.text : CC_DARK.inactive
                    }
                    wrap="wrap"
                  >
                    {cur}
                    {picked}
                    {o.label}
                  </Text>
                );
              })}
              <Text color={CC_DARK.subtle} italic>
                j/k · Space (multi) · Enter · Esc cancel
              </Text>
            </Box>
          ) : (
            <Box marginTop={1}>
              <Text color={CC_DARK.subtle}>
                Free text (Enter to submit, Esc cancel)
              </Text>
              <Box flexDirection="row">
                <Text color={CC_DARK.brand}>{":"} </Text>
                <TextInput
                  value={askFlow.textDraft}
                  onChange={(v) =>
                    setAskFlow((s) => (s ? { ...s, textDraft: v } : null))
                  }
                  onSubmit={submitAskText}
                />
              </Box>
            </Box>
          )}
        </Box>
      ) : !overlay ? (
        <Box
          flexDirection="row"
          marginTop={1}
          borderStyle="single"
          borderColor={CC_DARK.promptBorder}
          paddingX={1}
        >
          <Text color={CC_DARK.brand}>{">"} </Text>
          <TextInput
            value={input}
            onChange={setInput}
            onSubmit={sendText}
            placeholder="Message…"
          />
        </Box>
      ) : (
        <Box marginTop={1}>
          <Text color={CC_DARK.subtle}>(Close dialog to type — Esc)</Text>
        </Box>
      )}

      <Box marginTop={1}>
        <Text color={CC_DARK.subtle}>
          Ctrl+R history · Ctrl+O tool panel · Ctrl+C interrupt / exit · Ctrl+D
          exit
        </Text>
      </Box>
    </Box>
  );
}
