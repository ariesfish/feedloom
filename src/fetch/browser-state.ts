import { cp, mkdir, mkdtemp, stat, copyFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

import { fetchBrowserHtml } from "./browser.js";

export interface BrowserStateConfig {
  userDataDir: string;
  profile: string;
  waitMs?: number;
  networkIdle?: boolean;
  proxy?: string;
  dnsOverHttps?: boolean;
  waitSelector?: string;
  waitSelectorState?: "attached" | "detached" | "visible" | "hidden";
  clickSelectors?: string[];
  scrollToBottom?: boolean;
  headless?: boolean;
  realChromeDefaults?: boolean;
}

const ROOT_STATE_FILES = ["Local State", "First Run", "Last Version"] as const;
const IGNORED_NAMES = new Set([
  "Crashpad",
  "Code Cache",
  "GPUCache",
  "ShaderCache",
  "GrShaderCache",
  "GraphiteDawnCache",
]);

function isIgnoredBrowserStatePath(path: string): boolean {
  const name = basename(path);
  if (IGNORED_NAMES.has(name)) {
    return true;
  }
  if (name.startsWith("Singleton")) {
    return true;
  }
  if (name === "lockfile") {
    return true;
  }
  return /\.(?:lock|tmp|log)$/i.test(name);
}

async function copyFileIfPresent(source: string, destination: string): Promise<void> {
  try {
    const info = await stat(source);
    if (info.isFile()) {
      await copyFile(source, destination);
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

export async function copyBrowserState(sourceRoot: string, destRoot: string, profile: string): Promise<void> {
  const profileDir = join(sourceRoot, profile);
  const profileInfo = await stat(profileDir).catch((error: unknown) => {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(`Chrome profile not found: ${profileDir}`);
    }
    throw error;
  });
  if (!profileInfo.isDirectory()) {
    throw new Error(`Chrome profile is not a directory: ${profileDir}`);
  }

  await mkdir(destRoot, { recursive: true });
  for (const filename of ROOT_STATE_FILES) {
    await copyFileIfPresent(join(sourceRoot, filename), join(destRoot, filename));
  }

  await cp(profileDir, join(destRoot, profile), {
    recursive: true,
    force: true,
    filter: (source) => !isIgnoredBrowserStatePath(source),
  });
}

export async function fetchBrowserHtmlWithBrowserState(url: string, config: BrowserStateConfig): Promise<string> {
  const stateCopy = await mkdtemp(join(tmpdir(), "feedloom-browser-state-"));
  try {
    await copyBrowserState(config.userDataDir, stateCopy, config.profile);
    return await fetchBrowserHtml(url, {
      userDataDir: stateCopy,
      channel: "chrome",
      headless: config.headless ?? true,
      timeoutMs: 90_000,
      waitMs: config.waitMs ?? 2_500,
      networkIdle: config.networkIdle ?? true,
      extraArgs: [`--profile-directory=${config.profile}`],
      proxy: config.proxy,
      dnsOverHttps: config.dnsOverHttps,
      waitSelector: config.waitSelector,
      waitSelectorState: config.waitSelectorState,
      clickSelectors: config.clickSelectors,
      scrollToBottom: config.scrollToBottom,
      realChromeDefaults: config.realChromeDefaults ?? true,
    });
  } finally {
    await rm(stateCopy, { recursive: true, force: true });
  }
}
