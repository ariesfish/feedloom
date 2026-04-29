import { readFile, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

import { URL_RE } from "../constants.js";
import { makeUrlItem, type UrlItem } from "../models.js";

export class CheckboxFile {
  readonly path: string;
  lines: string[];
  dirty = false;

  private constructor(path: string, lines: string[]) {
    this.path = path;
    this.lines = lines;
  }

  static async load(path: string): Promise<CheckboxFile> {
    const text = await readFile(path, "utf8");
    return new CheckboxFile(path, text.split(/\r?\n/).filter((_, index, lines) => index < lines.length - 1 || lines[index] !== ""));
  }

  markDone(lineNo: number | undefined, url: string): void {
    if (lineNo === undefined || lineNo < 1 || lineNo > this.lines.length) {
      return;
    }
    const line = this.lines[lineNo - 1] ?? "";
    if (line.includes(url) && line.includes("- [ ] ")) {
      this.lines[lineNo - 1] = line.replace("- [ ] ", "- [x] ");
      this.dirty = true;
    }
  }

  async save(): Promise<void> {
    if (this.dirty) {
      await writeFile(this.path, `${this.lines.join("\n")}\n`, "utf8");
    }
  }
}

export interface ParseInputsResult {
  items: UrlItem[];
  checkboxFiles: Map<string, CheckboxFile>;
}

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return false;
    }
    throw error;
  }
}

export async function parseInputs(inputs: string[]): Promise<ParseInputsResult> {
  const checkboxFiles = new Map<string, CheckboxFile>();
  const items: UrlItem[] = [];
  const seen = new Set<string>();

  for (const raw of inputs) {
    const path = resolve(raw.replace(/^~(?=$|\/)/, process.env.HOME ?? "~"));
    if (await isFile(path)) {
      const checkbox = await CheckboxFile.load(path);
      checkboxFiles.set(path, checkbox);
      checkbox.lines.forEach((line, index) => {
        const match = URL_RE.exec(line);
        if (!match) {
          return;
        }
        const url = match[0];
        if (seen.has(url)) {
          return;
        }
        seen.add(url);
        items.push(makeUrlItem(url, { sourcePath: path, lineNo: index + 1 }));
      });
      continue;
    }

    const match = URL_RE.exec(raw);
    if (!match) {
      throw new Error(`Unsupported input: ${raw}`);
    }
    const url = match[0];
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);
    items.push(makeUrlItem(url));
  }

  if (items.length === 0) {
    throw new Error("No URLs found in input");
  }
  return { items, checkboxFiles };
}

export function sliceItems(items: UrlItem[], start: number, end: number, limit: number): UrlItem[] {
  if (start < 1) {
    throw new Error("--start must be at least 1");
  }
  if (end < 0) {
    throw new Error("--end must be 0 or a positive 1-based index");
  }
  if (limit < 0) {
    throw new Error("--limit must be 0 or a positive integer");
  }
  if (end !== 0 && end < start) {
    throw new Error("--end must be greater than or equal to --start");
  }
  const begin = Math.max(start - 1, 0);
  const result = items.slice(begin, end || undefined);
  return limit > 0 ? result.slice(0, limit) : result;
}
