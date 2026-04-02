import { randomUUID } from "node:crypto";

const MAX_BUFFER = 200_000;
const sessions = new Map<string, Map<string, ShellJobRecord>>();

export type ShellJobRecord = {
  id: string;
  command: string;
  cwd: string;
  startedAt: number;
  pid: number;
  running: boolean;
  exitCode: number | null;
  buffer: string;
  kill?: () => void;
};

function appendBuffer(buf: string, chunk: string, max: number): string {
  const next = buf + chunk;
  return next.length > max ? next.slice(-max) : next;
}

async function readStreamToBuffer(
  stream: ReadableStream<Uint8Array> | null,
  onData: (s: string) => void,
): Promise<void> {
  if (!stream) return;
  const reader = stream.getReader();
  const dec = new TextDecoder();
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) onData(dec.decode(value, { stream: true }));
    }
  } finally {
    reader.releaseLock();
  }
}

export function listShellJobs(sessionId: string): ShellJobRecord[] {
  const m = sessions.get(sessionId);
  return m ? [...m.values()] : [];
}

export function getShellJob(
  sessionId: string,
  jobId: string,
): ShellJobRecord | undefined {
  return sessions.get(sessionId)?.get(jobId);
}

export function killShellJob(sessionId: string, jobId: string): boolean {
  const job = sessions.get(sessionId)?.get(jobId);
  if (!job?.kill) return false;
  job.kill();
  return true;
}

export async function runBashWithOptionalBackground(args: {
  sessionId: string;
  cwd: string;
  command: string;
  blockUntilMs: number;
  maxOutputChars: number;
}): Promise<Record<string, unknown>> {
  const proc = Bun.spawn(["sh", "-c", args.command], {
    cwd: args.cwd,
    stdout: "pipe",
    stderr: "pipe",
  });

  const cap = Math.min(args.maxOutputChars, MAX_BUFFER);
  let combined = "";
  let liveRec: ShellJobRecord | null = null;

  const onData = (s: string) => {
    combined = appendBuffer(combined, s, cap);
    if (liveRec) liveRec.buffer = combined;
  };

  const readOut = readStreamToBuffer(proc.stdout, onData);
  const readErr = readStreamToBuffer(proc.stderr, onData);

  const exitPromise = proc.exited.then((code) => code);
  const timeoutPromise = new Promise<"timeout">((resolve) =>
    setTimeout(() => resolve("timeout"), args.blockUntilMs),
  );

  const winner = await Promise.race([
    exitPromise.then((c) => ({ kind: "exit" as const, code: c })),
    timeoutPromise.then(() => ({ kind: "timeout" as const })),
  ]);

  if (winner.kind === "exit") {
    await Promise.all([readOut, readErr]);
    return {
      mode: "completed",
      exitCode: winner.code,
      output: combined.slice(-args.maxOutputChars),
      command: args.command,
    };
  }

  const pid = proc.pid ?? 0;
  const id = randomUUID().slice(0, 8);
  const map = sessions.get(args.sessionId) ?? new Map<string, ShellJobRecord>();
  sessions.set(args.sessionId, map);

  const rec: ShellJobRecord = {
    id,
    command: args.command,
    cwd: args.cwd,
    startedAt: Date.now(),
    pid,
    running: true,
    exitCode: null,
    buffer: combined,
    kill: () => {
      try {
        proc.kill();
      } catch {
        /* ignore */
      }
    },
  };
  map.set(id, rec);
  liveRec = rec;

  void (async () => {
    try {
      await Promise.all([readOut, readErr]);
    } catch {
      /* ignore */
    }
    try {
      const code = await proc.exited;
      rec.exitCode = code;
    } finally {
      rec.running = false;
      rec.buffer = combined.slice(-cap);
    }
  })();

  const preview = combined.slice(-Math.min(4000, args.maxOutputChars));
  return {
    mode: "background",
    job_id: id,
    pid,
    message: `Still running after ${args.blockUntilMs}ms; use shell_status job_id=${id}, stop with shell_kill.`,
    output_preview: preview,
    command: args.command,
  };
}
