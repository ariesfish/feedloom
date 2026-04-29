import { writeFile } from "node:fs/promises";

import { htmlHasMeaningfulContent } from "../extract/meaningful.js";
import { fetchBrowserHtml } from "./browser.js";
import { type BrowserStateConfig, fetchBrowserHtmlWithBrowserState } from "./browser-state.js";
import { fetchStaticHtml } from "./static.js";
import { fetchStealthHtml } from "./stealth.js";

export type FetchMode = "auto" | "static" | "browser" | "stealth";

export interface FetchHtmlOptions {
  outputPath?: string;
  browserState?: BrowserStateConfig | null;
  fetchMode?: FetchMode;
  waitMs?: number;
  networkIdle?: boolean;
  isMeaningful?: (url: string, html: string) => boolean;
  staticFetch?: (url: string) => Promise<string>;
  browserFetch?: (url: string) => Promise<string>;
  stealthFetch?: (url: string) => Promise<string>;
  browserStateFetch?: (url: string, browserState: BrowserStateConfig) => Promise<string>;
  solveCloudflare?: boolean;
  disableResources?: boolean;
  proxy?: string;
  dnsOverHttps?: boolean;
  waitSelector?: string;
  waitSelectorState?: "attached" | "detached" | "visible" | "hidden";
  clickSelectors?: string[];
  scrollToBottom?: boolean;
  headless?: boolean;
  realChromeDefaults?: boolean;
}

export interface FetchResult {
  url: string;
  finalUrl: string;
  html: string;
  mode: string;
  diagnostics: string[];
}

type Attempt = {
  label: string;
  fetch: () => Promise<string>;
};

async function writeOutputIfRequested(outputPath: string | undefined, html: string): Promise<void> {
  if (outputPath) {
    await writeFile(outputPath, html, "utf8");
  }
}

export async function fetchHtmlResult(url: string, options: FetchHtmlOptions = {}): Promise<FetchResult> {
  const isMeaningful = options.isMeaningful ?? htmlHasMeaningfulContent;
  const staticFetch = options.staticFetch ?? (async (targetUrl: string) => (await fetchStaticHtml(targetUrl)).html);
  const browserFetch = options.browserFetch ?? ((targetUrl: string) => fetchBrowserHtml(targetUrl, {
    waitMs: options.waitMs,
    networkIdle: options.networkIdle,
    proxy: options.proxy,
    dnsOverHttps: options.dnsOverHttps,
    waitSelector: options.waitSelector,
    waitSelectorState: options.waitSelectorState,
    clickSelectors: options.clickSelectors,
    scrollToBottom: options.scrollToBottom,
    headless: options.headless,
    realChromeDefaults: options.realChromeDefaults,
  }));
  const stealthFetch = options.stealthFetch ?? ((targetUrl: string) => fetchStealthHtml(targetUrl, {
    waitMs: options.waitMs,
    networkIdle: options.networkIdle,
    solveCloudflare: options.solveCloudflare,
    disableResources: options.disableResources,
    proxy: options.proxy,
    dnsOverHttps: options.dnsOverHttps,
    waitSelector: options.waitSelector,
    waitSelectorState: options.waitSelectorState,
    clickSelectors: options.clickSelectors,
    scrollToBottom: options.scrollToBottom,
  }));
  const browserStateFetch = options.browserStateFetch ?? fetchBrowserHtmlWithBrowserState;

  const mode = options.fetchMode ?? "auto";
  const attempts: Attempt[] = [];

  if (mode === "auto" || mode === "static") {
    attempts.push({
      label: "static",
      fetch: () => staticFetch(url),
    });
  }

  if (mode === "auto" || mode === "browser") {
    if (options.browserState) {
      attempts.push({
        label: "browser-state",
        fetch: () => browserStateFetch(url, options.browserState as BrowserStateConfig),
      });
    }

    attempts.push({
      label: "browser",
      fetch: () => browserFetch(url),
    });
  }

  if (mode === "auto" || mode === "stealth") {
    attempts.push({
      label: "stealth",
      fetch: () => stealthFetch(url),
    });
  }

  const errors: string[] = [];
  for (const attempt of attempts) {
    try {
      const html = await attempt.fetch();
      await writeOutputIfRequested(options.outputPath, html);
      if (isMeaningful(url, html)) {
        return { url, finalUrl: url, html, mode: attempt.label, diagnostics: errors };
      }
      errors.push(`${attempt.label} missing article content`);
    } catch (error) {
      errors.push(`${attempt.label} failed: ${(error as Error).message || String(error)}`);
    }
  }

  throw new Error(errors.join("; "));
}

export async function fetchHtml(url: string, options: FetchHtmlOptions = {}): Promise<string> {
  return (await fetchHtmlResult(url, options)).html;
}
