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

  it("applies matching site profile fetch preferences before fetching HTML", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-profile-fetch-"));
    try {
      const result = await processItem(
        { url: "https://example.com/profile-fetch", sourceKind: "html-page" },
        {
          outputDir,
          profiles: [
            {
              name: "demo",
              match: { hostSuffixes: ["example.com"] },
              fetch: { mode: "browser", preferBrowserState: true, scrollToBottom: true, waitMs: 8000 },
            },
          ],
          browserStateDefaults: { userDataDir: "/tmp/chrome", profile: "Default" },
          staticFetch: async () => {
            throw new Error("static should not be used");
          },
          browserStateFetch: async (_url, config) => {
            expect(config.userDataDir).toBe("/tmp/chrome");
            expect(config.profile).toBe("Default");
            expect(config.scrollToBottom).toBe(true);
            expect(config.waitMs).toBe(8000);
            return `<!doctype html><html><head><title>Profile Fetch</title></head><body><article>${longParagraph()}</article></body></html>`;
          },
        },
      );

      expect(result.title).toBe("Profile Fetch");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("uses the configured image fetcher before proxy-aware profile fallback", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-image-fetch-"));
    try {
      const result = await processItem(
        { url: "https://example.com/image-fetch", sourceKind: "html-page" },
        {
          outputDir,
          profiles: [
            {
              name: "demo",
              match: { hostSuffixes: ["example.com"] },
              fetch: { useProxyEnv: true },
            },
          ],
          staticFetch: async () => `<!doctype html><html><head><title>Image Fetch</title></head><body><article>${longParagraph()}<img src="/demo.png"></article></body></html>`,
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
          fetchImage: async (input) => {
            expect(String(input)).toBe("https://example.com/demo.png");
            return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
          },
        },
      );

      const note = await readFile(result.outputPath, "utf8");
      expect(note).toContain("assets/Image%20Fetch/image-001.png");
      await expect(readFile(join(outputDir, "assets", "Image Fetch", "image-001.png"))).resolves.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("passes proxy-aware fetch to Defuddle for matching site profiles", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-defuddle-fetch-"));
    try {
      const result = await processItem(
        { url: "https://youtube.com/watch?v=demo", sourceKind: "html-page" },
        {
          outputDir,
          profiles: [
            {
              name: "youtube",
              match: { hostSuffixes: ["youtube.com"] },
              fetch: { useProxyEnv: true },
            },
          ],
          staticFetch: async () => `<!doctype html><html><head><title>Video Demo</title></head><body><script>ytInitialPlayerResponse = {"videoDetails":{"videoId":"demo"}}</script><main>${longParagraph()}</main></body></html>`,
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
        },
      );

      expect(result.title).toBe("Video Demo");
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("fails when a matching site profile requires extracted text but extraction is empty", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-require-text-"));
    try {
      await expect(processItem(
        { url: "https://empty.example/video", sourceKind: "html-page" },
        {
          outputDir,
          profiles: [
            {
              name: "empty-demo",
              match: { hostSuffixes: ["empty.example"] },
              extraction: { requireText: true },
            },
          ],
          staticFetch: async () => "",
          browserFetch: async () => {
            throw new Error("browser should not be used");
          },
          isMeaningful: () => true,
        },
      )).rejects.toThrow("matched site rule requires extracted text, but no text content was extracted");
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
