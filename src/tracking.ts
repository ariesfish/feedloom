import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import type { UrlItem } from "./models.js";

interface ProgressEntry {
  index: number;
  url: string;
  sourcePath?: string;
  lineNo?: number;
  status: "pending" | "in_progress" | "done" | "failed";
  notePath?: string;
  error?: string;
}

export class ProgressTracker {
  readonly path?: string;
  private readonly entries: ProgressEntry[];

  constructor(items: UrlItem[], private readonly targetDir: string) {
    this.entries = items.map((item, index) => ({
      index: index + 1,
      url: item.url,
      sourcePath: item.sourcePath,
      lineNo: item.lineNo,
      status: "pending",
    }));
    if (items.length > 1) {
      this.path = join(tmpdir(), `feedloom-progress-${Date.now()}-${Math.random().toString(16).slice(2)}.json`);
      this.write();
    }
  }

  start(url: string): void {
    this.update(url, { status: "in_progress", error: undefined });
  }

  done(url: string, notePath: string): void {
    this.update(url, { status: "done", notePath, error: undefined });
  }

  fail(url: string, error: string): void {
    this.update(url, { status: "failed", error });
  }

  private update(url: string, patch: Partial<ProgressEntry>): void {
    const entry = this.entries.find((item) => item.url === url);
    if (entry) Object.assign(entry, patch);
    this.write();
  }

  private write(): void {
    if (!this.path) return;
    const payload = {
      created_at: new Date().toISOString(),
      target_dir: this.targetDir,
      items: this.entries,
    };
    writeFileSync(this.path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
  }
}
