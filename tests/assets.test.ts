import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { localizeImages } from "../src/assets.js";

describe("localizeImages", () => {
  it("downloads images once and rewrites img src to local assets", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-ts-assets-"));
    let calls = 0;
    try {
      const html = await localizeImages('<p><img src="/demo.png"><img src="https://example.com/demo.png"></p>', {
        outputDir,
        noteSlug: "Demo",
        baseUrl: "https://example.com/post",
        fetchImage: async () => {
          calls += 1;
          return new Response(new Uint8Array([1, 2, 3]), { headers: { "content-type": "image/png" } });
        },
      });

      expect(calls).toBe(1);
      expect(html).toContain('src="assets/Demo/image-001.png"');
      await expect(readFile(join(outputDir, "assets", "Demo", "image-001.png"))).resolves.toEqual(Buffer.from([1, 2, 3]));
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });

  it("uses lazy image attributes and skips non-image responses", async () => {
    const outputDir = await mkdtemp(join(tmpdir(), "feedloom-ts-assets-"));
    try {
      const html = await localizeImages('<p><img data-src="/lazy.webp" srcset="/old.png 1x"><img src="/not-image"></p>', {
        outputDir,
        noteSlug: "Lazy",
        baseUrl: "https://example.com/post",
        fetchImage: async (input) => {
          if (String(input).endsWith("/not-image")) {
            return new Response("nope", { headers: { "content-type": "text/plain" } });
          }
          return new Response(new Uint8Array([4, 5, 6]), { headers: { "content-type": "image/webp" } });
        },
      });

      expect(html).toContain('src="assets/Lazy/image-001.webp"');
      expect(html).not.toContain("data-src");
      expect(html).not.toContain("srcset");
      await expect(readFile(join(outputDir, "assets", "Lazy", "image-001.webp"))).resolves.toEqual(Buffer.from([4, 5, 6]));
    } finally {
      await rm(outputDir, { recursive: true, force: true });
    }
  });
});
