import { BrowserFetchSession, type BrowserFetchOptions } from "./browser.js";
import { StealthFetchSession, type StealthFetchOptions } from "./stealth.js";

export interface BatchFetchSessionsOptions {
  browser?: BrowserFetchOptions;
  stealth?: StealthFetchOptions;
}

export class BatchFetchSessions {
  private browserSession: BrowserFetchSession | null = null;
  private stealthSession: StealthFetchSession | null = null;

  constructor(private readonly options: BatchFetchSessionsOptions = {}) {}

  async browserFetch(url: string): Promise<string> {
    this.browserSession ??= new BrowserFetchSession(this.options.browser);
    return this.browserSession.fetch(url);
  }

  async stealthFetch(url: string): Promise<string> {
    this.stealthSession ??= new StealthFetchSession(this.options.stealth);
    return this.stealthSession.fetch(url);
  }

  async close(): Promise<void> {
    await Promise.all([
      this.browserSession?.close(),
      this.stealthSession?.close(),
    ]);
    this.browserSession = null;
    this.stealthSession = null;
  }
}
