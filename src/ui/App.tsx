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
import { getUsageTotals } from "../cost/index.js";
import type { EnvConfig } from "../env.js";
import {
  type PermissionDecision,
  type PermissionRequest,
  getEmptyToolPermissionContext,
} from "../permissions/index.js";
import { runResearchWorkflow } from "../research/workflow.js";
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

  const [exitPendingC, setExitPendingC] = useState(false);
  const [exitPendingD, setExitPendingD] = useState(false);

  const permissionResolverRef = useRef<
    ((d: PermissionDecision) => void) | null
  >(null);
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

  const closeOverlay = useCallback(() => {
    setOverlay(null);
  }, []);

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
      if (!v || busy || overlay) return;

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
    [busy, onPermissionRequest, overlay, props, push],
  );

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

    if (ctrl && ch === "r" && !overlay) {
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

    if (!overlay && !busy) {
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

      {!overlay ? (
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
