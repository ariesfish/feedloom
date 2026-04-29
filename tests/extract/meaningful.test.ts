import { describe, expect, it } from "vitest";

import { extractPreloadedMarkdownUrl, htmlHasMeaningfulContent } from "../../src/extract/meaningful.js";

describe("extractPreloadedMarkdownUrl", () => {
  it("resolves Obsidian-style preloaded markdown URLs", () => {
    expect(
      extractPreloadedMarkdownUrl(
        "<script>window.preloadPage = f('/help/page.md')</script>",
        "https://obsidian.md/help/page",
      ),
    ).toBe("https://obsidian.md/help/page.md");
  });
});

describe("htmlHasMeaningfulContent", () => {
  it("accepts preloaded markdown shells", () => {
    expect(
      htmlHasMeaningfulContent(
        "https://obsidian.md/help/page",
        "<script>window.preloadPage = f('/help/page.md')</script>",
      ),
    ).toBe(true);
  });

  it("rejects short shell HTML", () => {
    expect(htmlHasMeaningfulContent("https://example.com", "<main>short</main>")).toBe(false);
  });

  it("accepts long article text", () => {
    const text = "word ".repeat(140);
    expect(htmlHasMeaningfulContent("https://example.com", `<article>${text}</article>`)).toBe(true);
  });
});
