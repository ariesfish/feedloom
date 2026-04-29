import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { processItem } from "../src/pipeline.js";

function longParagraph(): string {
  return `<p>${"This is meaningful article text, ".repeat(80)}</p>`;
}

describe("processItem", () => {
  it("writes a markdown note with frontmatter from fetched HTML", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-pipeline-"));
    try {
      const result = await processItem(
        { url: "https://example.com/demo", sourceKind: "html-page" },
        {
          outputDir,
          staticFetch: async () => `<!doctype html><html><head><title>Demo Article</title><meta name="author" content="Ada"></head><body><article><h1>Demo Article</h1>${longParagraph()}</article></body></html>`,
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
        },
      );

      expect(result.title).toBe("Demo Article");
      const note = await readFile(result.outputPath, "utf8");
      expect(note).toContain('source: "https://example.com/demo"');
      expect(note).toContain('author: "Ada"');
      expect(note).toMatch(/created: "[^"]+"/);
      expect(note).toContain("# Demo Article");
      expect(note).toContain("meaningful article text");
      expect(note.endsWith("\n")).toBe(true);
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("uses feed publishedAt as created fallback when HTML has no published metadata", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-created-"));
    try {
      const result = await processItem(
        {
          url: "https://example.com/from-feed",
          sourceKind: "html-page",
          publishedAt: new Date("2026-01-02T00:00:00.000Z"),
        },
        {
          outputDir,
          staticFetch: async () => `<!doctype html><html><head><title>Feed Item</title></head><body><article>${longParagraph()}</article></body></html>`,
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
        },
      );

      const note = await readFile(result.outputPath, "utf8");
      expect(note).toContain('created: "2026-01-02"');
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("removes an existing note and matching asset directory before regenerating the same source URL", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-rerun-"));
    try {
      await mkdir(join(outputDir, "assets", "Old Title"), { recursive: true });
      await writeFile(join(outputDir, "Old Title.md"), `---\nsource: "https://example.com/rerun"\ncreated: "2020-01-01"\n---\n\nold body\n`, "utf8");
      await writeFile(join(outputDir, "assets", "Old Title", "image-001.jpg"), "old", "utf8");

      const result = await processItem(
        { url: "https://example.com/rerun", sourceKind: "html-page" },
        {
          outputDir,
          staticFetch: async () => `<!doctype html><html><head><title>New Title</title></head><body><article>${longParagraph()}</article></body></html>`,
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
        },
      );

      expect(result.outputPath.endsWith("New Title.md")).toBe(true);
      await expect(readFile(join(outputDir, "Old Title.md"), "utf8")).rejects.toThrow();
      await expect(readFile(join(outputDir, "assets", "Old Title", "image-001.jpg"), "utf8")).rejects.toThrow();
      const note = await readFile(result.outputPath, "utf8");
      expect(note).toContain("meaningful article text");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
