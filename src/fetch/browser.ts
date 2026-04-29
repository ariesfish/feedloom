import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page } from "patchright";

const SCRAPLING_DEFAULT_ARGS = [
  "--no-pings",
  "--no-first-run",
  "--disable-infobars",
  "--disable-breakpad",
  "--no-service-autorun",
  "--homepage=about:blank",
  "--password-store=basic",
  "--disable-hang-monitor",
  "--no-default-browser-check",
  "--disable-session-crashed-bubble",
  "--disable-search-engine-choice-screen",
];

const SCRAPLING_HARMFUL_ARGS = [
  "--enable-automation",
  "--disable-popup-blocking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
];

export interface BrowserFetchOptions {
  headless?: boolean;
  timeoutMs?: number;
  waitMs?: number;
  networkIdle?: boolean;
  userDataDir?: string;
  channel?: "chrome" | "chromium";
  extraArgs?: string[];
  proxy?: string;
  dnsOverHttps?: boolean;
  waitSelector?: string;
  waitSelectorState?: "attached" | "detached" | "visible" | "hidden";
  clickSelectors?: string[];
  scrollToBottom?: boolean;
  realChromeDefaults?: boolean;
  referer?: string;
}

async function runPageActions(page: Page, options: BrowserFetchOptions): Promise<void> {
  for (const selector of options.clickSelectors ?? []) {
    await page.locator(selector).first().click({ timeout: 5_000 }).catch(() => undefined);
  }
  if (options.scrollToBottom) {
    await page.evaluate(async () => {
      const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
      for (let i = 0; i < 8; i += 1) {
        window.scrollTo(0, document.body.scrollHeight);
        await delay(250);
      }
    });
  }
  if (options.waitSelector) {
    await page.locator(options.waitSelector).first().waitFor({
      state: options.waitSelectorState ?? "attached",
      timeout: options.timeoutMs ?? 90_000,
    }).catch(() => undefined);
  }
}

async function launchBrowserContext(options: BrowserFetchOptions): Promise<{ context: BrowserContext; userDataDir: string; ownsUserDataDir: boolean }> {
  const userDataDir = options.userDataDir ?? (await mkdtemp(join(tmpdir(), "feedloom-ts-browser-")));
  const ownsUserDataDir = options.userDataDir === undefined;
  const realChromeDefaults = options.realChromeDefaults ?? false;
  const extraArgs = realChromeDefaults
    ? [...new Set([...(options.extraArgs ?? []), ...SCRAPLING_DEFAULT_ARGS])]
    : [...(options.extraArgs ?? [])];
  if (options.dnsOverHttps) {
    extraArgs.push("--dns-over-https-templates=https://cloudflare-dns.com/dns-query");
  }

  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: options.channel,
    headless: options.headless ?? true,
    args: extraArgs,
    ignoreDefaultArgs: realChromeDefaults ? SCRAPLING_HARMFUL_ARGS : undefined,
    proxy: options.proxy ? { server: options.proxy } : undefined,
    ignoreHTTPSErrors: true,
    colorScheme: realChromeDefaults ? "dark" : undefined,
    deviceScaleFactor: realChromeDefaults ? 2 : undefined,
    locale: undefined,
    timezoneId: realChromeDefaults ? "" : undefined,
    userAgent: realChromeDefaults ? "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/145.0.0.0 Safari/537.36" : undefined,
    viewport: { width: 1365, height: 900 },
    screen: { width: 1365, height: 900 },
  });
  return { context, userDataDir, ownsUserDataDir };
}

async function fetchWithContext(context: BrowserContext, url: string, options: BrowserFetchOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? 90_000;
  const waitMs = options.waitMs ?? 2_500;
  const page = await context.newPage();
  try {
    await page.goto(url, { waitUntil: "load", timeout: timeoutMs, referer: options.referer ?? (options.realChromeDefaults ? "https://www.google.com/" : undefined) });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    if (options.networkIdle ?? true) {
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    }
    await runPageActions(page, options);
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    return await page.content();
  } finally {
    await page.close().catch(() => undefined);
  }
}

export class BrowserFetchSession {
  private context: BrowserContext | null = null;
  private userDataDir = "";
  private ownsUserDataDir = false;

  constructor(private readonly options: BrowserFetchOptions = {}) {}

  async start(): Promise<void> {
    if (this.context) return;
    const launched = await launchBrowserContext(this.options);
    this.context = launched.context;
    this.userDataDir = launched.userDataDir;
    this.ownsUserDataDir = launched.ownsUserDataDir;
  }

  async fetch(url: string): Promise<string> {
    await this.start();
    if (!this.context) throw new Error("Browser context was not initialized");
    return fetchWithContext(this.context, url, this.options);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    if (this.ownsUserDataDir && this.userDataDir) {
      await rm(this.userDataDir, { recursive: true, force: true });
    }
  }
}

export async function fetchBrowserHtml(url: string, options: BrowserFetchOptions = {}): Promise<string> {
  const session = new BrowserFetchSession(options);
  try {
    return await session.fetch(url);
  } finally {
    await session.close();
  }
}
