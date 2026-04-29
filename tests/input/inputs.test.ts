import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CheckboxFile, parseInputs, sliceItems } from "../../src/input/inputs.js";
import { makeUrlItem } from "../../src/models.js";

function makeItems() {
  return [1, 2, 3, 4, 5].map((index) => makeUrlItem(`https://example.com/${index}`));
}

describe("sliceItems", () => {
  it("applies start, end, and limit", () => {
    expect(sliceItems(makeItems(), 2, 4, 2).map((item) => item.url)).toEqual([
      "https://example.com/2",
      "https://example.com/3",
    ]);
  });

  it("rejects invalid start", () => {
    expect(() => sliceItems(makeItems(), 0, 0, 0)).toThrow("--start");
  });

  it("rejects end before start", () => {
    expect(() => sliceItems(makeItems(), 3, 2, 0)).toThrow("--end");
  });

  it("rejects negative limit", () => {
    expect(() => sliceItems(makeItems(), 1, 0, -1)).toThrow("--limit");
  });
});

describe("parseInputs", () => {
  it("parses direct URLs and deduplicates them", async () => {
    const result = await parseInputs(["https://example.com/1", "see https://example.com/1", "https://example.com/2"]);
    expect(result.items.map((item) => item.url)).toEqual(["https://example.com/1", "https://example.com/2"]);
    expect(result.checkboxFiles.size).toBe(0);
  });

  it("parses URL files and records source line numbers", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-inputs-"));
    const file = join(dir, "urls.md");
    try {
      await writeFile(file, "- [ ] https://example.com/1\ntext\n- [ ] https://example.com/2\n", "utf8");
      const result = await parseInputs([file]);
      expect(result.items.map((item) => [item.url, item.sourcePath, item.lineNo])).toEqual([
        ["https://example.com/1", file, 1],
        ["https://example.com/2", file, 3],
      ]);
      expect(result.checkboxFiles.has(file)).toBe(true);
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("rejects unsupported inputs", async () => {
    await expect(parseInputs(["not-a-url"])).rejects.toThrow("Unsupported input");
  });

  it("rejects empty URL files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-inputs-"));
    const file = join(dir, "urls.md");
    try {
      await writeFile(file, "no urls here\n", "utf8");
      await expect(parseInputs([file])).rejects.toThrow("No URLs found");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});

describe("CheckboxFile", () => {
  it("marks matching unchecked URL lines as done", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-checkbox-"));
    const file = join(dir, "urls.md");
    try {
      await writeFile(file, "- [ ] https://example.com/1\n- [x] https://example.com/2\n", "utf8");
      const checkbox = await CheckboxFile.load(file);
      checkbox.markDone(1, "https://example.com/1");
      checkbox.markDone(2, "https://example.com/2");
      await checkbox.save();
      await expect(readFile(file, "utf8")).resolves.toBe(
        "- [x] https://example.com/1\n- [x] https://example.com/2\n",
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
