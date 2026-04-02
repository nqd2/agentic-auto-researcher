#!/usr/bin/env bun
import { randomUUID } from "node:crypto";
import { render } from "ink";
import React from "react";
import { readEnv } from "./env.js";
import { runResearchWorkflow } from "./research/workflow.js";
import { ensureAarLayout } from "./setup.js";
import { App } from "./ui/App.js";

async function main(): Promise<void> {
  const cwd = process.cwd();
  const argv = process.argv.slice(2);
  const cmd = argv[0] ?? "start";

  await ensureAarLayout(cwd);
  const aarRoot = `${cwd}/.aar`;
  const env = readEnv();

  if (cmd === "research") {
    const topic = argv.slice(1).join(" ").trim();
    if (!topic) {
      console.error('Usage: aar research "<topic>"');
      process.exit(1);
    }
    if (!env.apiKey) {
      console.error("Missing API_KEY in environment (.env)");
      process.exit(1);
    }
    const sessionId = randomUUID();
    const { planPath, reply } = await runResearchWorkflow({
      cwd,
      aarRoot,
      env,
      sessionId,
      topic,
      onStream: (s) => process.stdout.write(s),
      onTool: (n, s) => console.error(`\n[tool ${n}] ${s}\n`),
    });
    console.error(`\nPlan: ${planPath}\n`);
    console.log(reply);
    return;
  }

  if (cmd === "start" || cmd === "") {
    if (!env.apiKey) {
      console.error(
        "Missing API_KEY — copy .env.example to .env and fill keys.",
      );
    }
    const sessionId = randomUUID();
    render(
      React.createElement(App, {
        cwd,
        aarRoot,
        env,
        sessionId,
        initialTopic: argv.slice(1).join(" ").trim() || undefined,
      }),
    );
    return;
  }

  console.error('Unknown command. Use: aar start | aar research "..."');
  process.exit(1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
