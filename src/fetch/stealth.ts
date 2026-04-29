import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { chromium, type BrowserContext, type Page, type Route } from "patchright";

const DEFAULT_ARGS = [
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

const STEALTH_ARGS = [
  "--test-type",
  "--lang=en-US",
  "--mute-audio",
  "--disable-sync",
  "--hide-scrollbars",
  "--disable-logging",
  "--start-maximized",
  "--enable-async-dns",
  "--accept-lang=en-US",
  "--use-mock-keychain",
  "--disable-translate",
  "--disable-voice-input",
  "--window-position=0,0",
  "--disable-wake-on-wifi",
  "--ignore-gpu-blocklist",
  "--enable-tcp-fast-open",
  "--enable-web-bluetooth",
  "--disable-cloud-import",
  "--disable-print-preview",
  "--disable-dev-shm-usage",
  "--metrics-recording-only",
  "--disable-crash-reporter",
  "--disable-partial-raster",
  "--disable-gesture-typing",
  "--disable-checker-imaging",
  "--disable-prompt-on-repost",
  "--force-color-profile=srgb",
  "--font-render-hinting=none",
  "--aggressive-cache-discard",
  "--disable-cookie-encryption",
  "--disable-domain-reliability",
  "--disable-threaded-animation",
  "--disable-threaded-scrolling",
  "--enable-simple-cache-backend",
  "--disable-background-networking",
  "--enable-surface-synchronization",
  "--disable-image-animation-resync",
  "--disable-renderer-backgrounding",
  "--disable-ipc-flooding-protection",
  "--prerender-from-omnibox=disabled",
  "--safebrowsing-disable-auto-update",
  "--disable-offer-upload-credit-cards",
  "--disable-background-timer-throttling",
  "--disable-new-content-rendering-timeout",
  "--run-all-compositor-stages-before-draw",
  "--disable-client-side-phishing-detection",
  "--disable-backgrounding-occluded-windows",
  "--disable-layer-tree-host-memory-pressure",
  "--autoplay-policy=user-gesture-required",
  "--disable-offer-store-unmasked-wallet-cards",
  "--disable-blink-features=AutomationControlled",
  "--disable-component-extensions-with-background-pages",
  "--enable-features=NetworkService,NetworkServiceInProcess,TrustTokens,TrustTokensAlwaysAllowIssuance",
  "--blink-settings=primaryHoverType=2,availableHoverTypes=2,primaryPointerType=4,availablePointerTypes=4",
  "--disable-features=AudioServiceOutOfProcess,TranslateUI,BlinkGenPropertyTrees",
];

const HARMFUL_ARGS = [
  "--enable-automation",
  "--disable-popup-blocking",
  "--disable-component-update",
  "--disable-default-apps",
  "--disable-extensions",
];

const EXTRA_RESOURCES = new Set([
  "font",
  "image",
  "media",
  "beacon",
  "object",
  "imageset",
  "texttrack",
  "websocket",
  "csp_report",
  "stylesheet",
]);

export interface StealthFetchOptions {
  headless?: boolean;
  timeoutMs?: number;
  waitMs?: number;
  networkIdle?: boolean;
  userDataDir?: string;
  userAgent?: string;
  locale?: string;
  timezoneId?: string;
  extraHeaders?: Record<string, string>;
  disableResources?: boolean;
  blockedDomains?: string[];
  blockWebrtc?: boolean;
  allowWebgl?: boolean;
  hideCanvas?: boolean;
  solveCloudflare?: boolean;
  waitSelector?: string;
  waitSelectorState?: "attached" | "detached" | "visible" | "hidden";
  extraArgs?: string[];
  proxy?: string;
  dnsOverHttps?: boolean;
  clickSelectors?: string[];
  scrollToBottom?: boolean;
}

function stealthArgs(options: StealthFetchOptions): string[] {
  const args = [...DEFAULT_ARGS, ...STEALTH_ARGS, ...(options.extraArgs ?? [])];
  if (options.blockWebrtc) {
    args.push("--webrtc-ip-handling-policy=disable_non_proxied_udp", "--force-webrtc-ip-handling-policy");
  }
  if (options.allowWebgl === false) {
    args.push("--disable-webgl", "--disable-webgl-image-chromium", "--disable-webgl2");
  }
  if (options.hideCanvas) {
    args.push("--fingerprinting-canvas-image-data-noise");
  }
  if (options.dnsOverHttps) {
    args.push("--dns-over-https-templates=https://cloudflare-dns.com/dns-query");
  }
  return [...new Set(args)];
}

function shouldBlock(route: Route, options: StealthFetchOptions): boolean {
  const request = route.request();
  if (options.disableResources && EXTRA_RESOURCES.has(request.resourceType())) return true;
  const host = new URL(request.url()).hostname;
  return options.blockedDomains?.some((domain) => host === domain || host.endsWith(`.${domain}`)) ?? false;
}

function cloudflareChallengeType(html: string): string | null {
  for (const type of ["non-interactive", "managed", "interactive"]) {
    if (html.includes(`cType: '${type}'`)) return type;
  }
  if (/challenges\.cloudflare\.com\/turnstile\/v/i.test(html)) return "embedded";
  if (html.includes("<title>Just a moment...</title>")) return "managed";
  return null;
}

async function solveCloudflare(page: Page): Promise<void> {
  let html = await page.content();
  let challenge = cloudflareChallengeType(html);
  if (!challenge) return;

  for (let attempt = 0; attempt < 3 && challenge; attempt += 1) {
    if (challenge === "non-interactive") {
      await page.waitForTimeout(1_000);
    } else {
      const box = await page.locator("#cf_turnstile div, #cf-turnstile div, .turnstile>div>div, .main-content p+div>div>div").last().boundingBox().catch(() => null);
      if (box) {
        await page.mouse.click(box.x + 27, box.y + 26, { delay: 150, button: "left" });
      } else {
        await page.waitForTimeout(1_000);
      }
    }
    await page.waitForLoadState("networkidle", { timeout: 10_000 }).catch(() => undefined);
    html = await page.content();
    challenge = cloudflareChallengeType(html);
  }
}

async function launchStealthContext(options: StealthFetchOptions): Promise<{ context: BrowserContext; userDataDir: string; ownsUserDataDir: boolean }> {
  const userDataDir = options.userDataDir ?? (await mkdtemp(join(tmpdir(), "feedloom-stealth-")));
  const ownsUserDataDir = options.userDataDir === undefined;
  const context = await chromium.launchPersistentContext(userDataDir, {
    channel: "chromium",
    headless: options.headless ?? true,
    args: stealthArgs(options),
    ignoreDefaultArgs: HARMFUL_ARGS,
    proxy: options.proxy ? { server: options.proxy } : undefined,
    ignoreHTTPSErrors: true,
    colorScheme: "dark",
    deviceScaleFactor: 2,
    isMobile: false,
    hasTouch: false,
    serviceWorkers: "allow",
    screen: { width: 1920, height: 1080 },
    viewport: { width: 1920, height: 1080 },
    permissions: ["geolocation", "notifications"],
    locale: options.locale,
    timezoneId: options.timezoneId,
    userAgent: options.userAgent,
    extraHTTPHeaders: options.extraHeaders,
  });
  return { context, userDataDir, ownsUserDataDir };
}

async function fetchWithStealthContext(context: BrowserContext, url: string, options: StealthFetchOptions): Promise<string> {
  const timeoutMs = options.timeoutMs ?? (options.solveCloudflare ? 60_000 : 30_000);
  const waitMs = options.waitMs ?? 0;
  const page = await context.newPage();
  try {
    page.setDefaultNavigationTimeout(timeoutMs);
    page.setDefaultTimeout(timeoutMs);
    if (options.disableResources || options.blockedDomains?.length) {
      await page.route("**/*", async (route) => (shouldBlock(route, options) ? route.abort() : route.continue()));
    }

    await page.goto(url, { waitUntil: "load", timeout: timeoutMs, referer: options.extraHeaders?.referer ?? "https://www.google.com/" });
    await page.waitForLoadState("domcontentloaded", { timeout: timeoutMs }).catch(() => undefined);
    if (options.networkIdle) {
      await page.waitForLoadState("networkidle", { timeout: timeoutMs }).catch(() => undefined);
    }
    if (options.solveCloudflare) {
      await solveCloudflare(page);
    }
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
      await page.locator(options.waitSelector).first().waitFor({ state: options.waitSelectorState ?? "attached", timeout: timeoutMs }).catch(() => undefined);
    }
    if (waitMs > 0) {
      await page.waitForTimeout(waitMs);
    }
    return await page.content();
  } finally {
    await page.close().catch(() => undefined);
  }
}

export class StealthFetchSession {
  private context: BrowserContext | null = null;
  private userDataDir = "";
  private ownsUserDataDir = false;

  constructor(private readonly options: StealthFetchOptions = {}) {}

  async start(): Promise<void> {
    if (this.context) return;
    const launched = await launchStealthContext(this.options);
    this.context = launched.context;
    this.userDataDir = launched.userDataDir;
    this.ownsUserDataDir = launched.ownsUserDataDir;
  }

  async fetch(url: string): Promise<string> {
    await this.start();
    if (!this.context) throw new Error("Stealth context was not initialized");
    return fetchWithStealthContext(this.context, url, this.options);
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => undefined);
    this.context = null;
    if (this.ownsUserDataDir && this.userDataDir) {
      await rm(this.userDataDir, { recursive: true, force: true });
    }
  }
}

export async function fetchStealthHtml(url: string, options: StealthFetchOptions = {}): Promise<string> {
  const session = new StealthFetchSession(options);
  try {
    return await session.fetch(url);
  } finally {
    await session.close();
  }
}
