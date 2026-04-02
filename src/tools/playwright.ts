import { z } from "zod";
import type { ToolDefinition } from "../Tool.js";
import type { EnvConfig } from "../env.js";

const navigateSchema = z.object({
  url: z.string().min(1),
});

function envChromeLaunchOptions(env: EnvConfig) {
  const opts: {
    executablePath?: string;
    args?: string[];
  } = {};
  if (env.chromeExecutablePath) {
    opts.executablePath = env.chromeExecutablePath;
  }
  if (env.chromeUserProfile) {
    opts.args = [`--user-data-dir=${env.chromeUserProfile}`];
  }
  return opts;
}

export function createPlaywrightNavigateTool(
  getEnv: () => EnvConfig,
): ToolDefinition {
  return {
    name: "playwright_navigate",
    description:
      "Open a URL in a headless Chromium (Playwright). Uses CHROME_EXECUTABLE_PATH and CHROME_USER_PROFILE from env when set.",
    zodSchema: navigateSchema,
    inputSchema: {
      type: "object",
      properties: { url: { type: "string", description: "https://..." } },
      required: ["url"],
    },
    async execute(raw) {
      const input = navigateSchema.parse(raw);
      const env = getEnv();
      const { chromium } = await import("playwright");
      const launchOpts = envChromeLaunchOptions(env);
      const browser = await chromium.launch({
        headless: true,
        ...launchOpts,
      });
      try {
        const page = await browser.newPage();
        await page.goto(input.url, {
          waitUntil: "domcontentloaded",
          timeout: 30_000,
        });
        const text = await page.innerText("body").catch(() => "");
        const title = await page.title();
        return JSON.stringify({
          title,
          textPreview: text.slice(0, 12_000),
        });
      } finally {
        await browser.close();
      }
    },
  };
}
