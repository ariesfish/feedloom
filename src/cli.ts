#!/usr/bin/env node

import { readdir } from "node:fs/promises";
import { join, resolve } from "node:path";

import { Command } from "commander";

import { loadSiteProfiles } from "./cleaning/profiles.js";
import { BatchFetchSessions } from "./fetch/batch.js";
import { parseInputs, sliceItems } from "./input/inputs.js";
import { expandSourceItems, parseSinceDate, type SourceKind } from "./input/sources.js";
import { processItem } from "./pipeline.js";
import { ProgressTracker } from "./tracking.js";

const program = new Command();

async function siteRulePathsFromDir(dir: string): Promise<string[]> {
  const names = await readdir(dir);
  return names.filter((name) => name.endsWith(".toml")).map((name) => join(dir, name));
}

function positiveIntOption(value: unknown, fallback: number): number {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed)) {
    throw new Error(`Expected integer option, got ${String(value)}`);
  }
  return parsed;
}

program
  .name("feedloom")
  .description("Archive long-form web content as clean Markdown with local assets")
  .version("0.1.0")
  .option("--output-dir <dir>", "Output directory for markdown notes", "clippings")
  .option("--source-kind <kind>", "auto, html-page, or rss-feed", "auto")
  .option("--since <date>", "Only keep feed entries on or after YYYY-MM-DD", "")
  .option("--limit <n>", "Process only first N deduplicated URLs", "0")
  .option("--start <n>", "Start from 1-based index after deduplication", "1")
  .option("--end <n>", "End at 1-based index after deduplication", "0")
  .option("--prefer-browser-state", "Try copied local Chrome profile before regular browser fallback", false)
  .option("--chrome-user-data-dir <path>", "Chrome user data directory used with --prefer-browser-state", "")
  .option("--chrome-profile <name>", "Chrome profile directory name", "Default")
  .option("--fetch-mode <mode>", "auto, static, browser, or stealth", "auto")
  .option("--no-network-idle", "Do not wait for browser networkidle before reading HTML")
  .option("--wait-ms <ms>", "Extra browser wait after load", "2500")
  .option("--solve-cloudflare", "In stealth mode, attempt Cloudflare Turnstile/interstitial challenge handling", false)
  .option("--disable-resources", "In stealth mode, block images/media/fonts/stylesheets for speed", false)
  .option("--proxy <server>", "Proxy server for browser/stealth fetch, e.g. http://127.0.0.1:8080", "")
  .option("--dns-over-https", "Use Chromium Cloudflare DNS-over-HTTPS flag for browser/stealth fetch", false)
  .option("--wait-selector <selector>", "Wait for a CSS selector after page load", "")
  .option("--wait-selector-state <state>", "attached, detached, visible, or hidden", "attached")
  .option("--click-selector <selector...>", "Click one or more selectors after page load", [])
  .option("--scroll-to-bottom", "Scroll to the bottom before reading HTML", false)
  .option("--headful", "Run browser/browser-state fetches with a visible Chrome window", false)
  .option("--site-rules-dir <dir>", "Optional directory of private TOML site extraction/cleaning rules", "")
  .option("--no-real-chrome-defaults", "Disable Scrapling-inspired real Chrome context defaults")
  .option("--no-reuse-browser", "Disable batch browser/stealth context reuse")
  .argument("[inputs...]", "URLs or files containing URLs")
  .action(async (inputs: string[], options: Record<string, unknown>) => {
    if (inputs.length === 0) {
      program.help({ error: true });
    }

    try {
      const sourceKind = String(options.sourceKind ?? "auto") as SourceKind;
      if (!["auto", "html-page", "rss-feed"].includes(sourceKind)) {
        throw new Error("--source-kind must be auto, html-page, or rss-feed");
      }
      const fetchMode = String(options.fetchMode ?? "auto") as "auto" | "static" | "browser" | "stealth";
      if (!["auto", "static", "browser", "stealth"].includes(fetchMode)) {
        throw new Error("--fetch-mode must be auto, static, browser, or stealth");
      }
      const waitMs = positiveIntOption(options.waitMs, 2500);
      const waitSelectorState = String(options.waitSelectorState ?? "attached") as "attached" | "detached" | "visible" | "hidden";
      if (!["attached", "detached", "visible", "hidden"].includes(waitSelectorState)) {
        throw new Error("--wait-selector-state must be attached, detached, visible, or hidden");
      }
      const { items, checkboxFiles } = await parseInputs(inputs);
      const since = options.since ? parseSinceDate(String(options.since)) : undefined;
      const expanded = await expandSourceItems(items, sourceKind, since);
      const selected = sliceItems(
        expanded,
        positiveIntOption(options.start, 1),
        positiveIntOption(options.end, 0),
        positiveIntOption(options.limit, 0),
      );
      const siteRulesDir = String(options.siteRulesDir || "");
      const profiles = siteRulesDir ? await loadSiteProfiles(await siteRulePathsFromDir(resolve(siteRulesDir))) : [];
      const outputDir = String(options.outputDir ?? "clippings");
      let failures = 0;
      const tracker = new ProgressTracker(selected, outputDir);
      if (tracker.path) {
        console.error(`Progress: ${tracker.path}`);
      }

      const browserOptions = {
        waitMs,
        networkIdle: Boolean(options.networkIdle),
        proxy: String(options.proxy || "") || undefined,
        dnsOverHttps: Boolean(options.dnsOverHttps),
        waitSelector: String(options.waitSelector || "") || undefined,
        waitSelectorState,
        clickSelectors: Array.isArray(options.clickSelector) ? options.clickSelector.map(String) : [],
        scrollToBottom: Boolean(options.scrollToBottom),
        headless: !Boolean(options.headful),
        realChromeDefaults: options.realChromeDefaults !== false,
      };
      const sessions = options.reuseBrowser === false ? null : new BatchFetchSessions({
        browser: browserOptions,
        stealth: {
          ...browserOptions,
          solveCloudflare: Boolean(options.solveCloudflare),
          disableResources: Boolean(options.disableResources),
        },
      });

      try {
      for (const item of selected) {
        tracker.start(item.url);
        try {
          const browserState = options.preferBrowserState
            ? {
                userDataDir: String(options.chromeUserDataDir || ""),
                profile: String(options.chromeProfile || "Default"),
                ...browserOptions,
              }
            : null;
          const result = await processItem(item, {
            outputDir,
            profiles,
            browserState,
            fetchMode,
            ...browserOptions,
            solveCloudflare: Boolean(options.solveCloudflare),
            disableResources: Boolean(options.disableResources),
            browserFetch: sessions ? (targetUrl: string) => sessions.browserFetch(targetUrl) : undefined,
            stealthFetch: sessions ? (targetUrl: string) => sessions.stealthFetch(targetUrl) : undefined,
          });
          console.error(`Wrote ${result.outputPath}`);
          tracker.done(item.url, result.outputPath);
          const checkbox = item.sourcePath ? checkboxFiles.get(item.sourcePath) : undefined;
          checkbox?.markDone(item.lineNo, item.url);
        } catch (error) {
          failures += 1;
          const message = (error as Error).message || String(error);
          tracker.fail(item.url, message);
          console.error(`Failed ${item.url}: ${message}`);
        }
      }
      } finally {
        await sessions?.close();
      }

      await Promise.all([...checkboxFiles.values()].map((checkbox) => checkbox.save()));
      process.exitCode = failures > 0 ? 1 : 0;
    } catch (error) {
      console.error((error as Error).message || String(error));
      process.exitCode = 2;
    }
  });

program.parseAsync();
