import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { cleanHtml } from "../../src/cleaning/clean-html.js";
import { loadSiteProfiles, profileFromTomlRule } from "../../src/cleaning/profiles.js";

function longParagraph(): string {
  return `<p>${"This is meaningful article text, ".repeat(80)}</p>`;
}

describe("Defuddle-backed cleanHtml", () => {
  it("extracts clean article content and metadata through Defuddle", async () => {
    const result = await cleanHtml(
      `<!doctype html>
      <html>
        <head>
          <title>Demo Article</title>
          <meta name="author" content="Ada">
          <script type="application/ld+json">{"@type":"Article","headline":"Demo"}</script>
        </head>
        <body>
          <nav>Home About Subscribe</nav>
          <aside class="related">Related links</aside>
          <article>
            <h1> Demo Article </h1>
            ${longParagraph()}
            <div class="share-buttons">Share this post</div>
            <script>alert(1)</script>
          </article>
        </body>
      </html>`,
      { baseUrl: "https://example.com/post", debug: true },
    );

    expect(result.content).toContain("Demo Article");
    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("Share this post");
    expect(result.content).not.toContain("alert(1)");
    expect(result.metadata.title).toBe("Demo");
    expect(result.metadata.author).toBe("Ada");
    expect(result.metadata.schemaOrgData).toBeTruthy();
    expect(result.debug?.contentSelector).toBeTruthy();
  });

  it("uses a profile content selector and applies profile removals after Defuddle", async () => {
    const profile = profileFromTomlRule("demo", {
      match: { host_suffixes: ["example.com"] },
      extract: { selectors: ["#article-body"] },
      metadata: { strip_title_regexes: ["\\s+-\\s+Example$"] },
      clean: {
        remove: {
          class_contains: ["share-card"],
          exact_text: ["目录"],
        },
      },
    });

    const result = await cleanHtml(
      `<main>
        <h1>Wrong shell</h1>
        <div id="article-body">
          <h1>Demo - Example</h1>
          ${longParagraph()}
          <div class="share-card">share</div>
          <p>目录</p>
        </div>
      </main>`,
      {
        baseUrl: "https://example.com/post",
        profiles: [profile],
        debug: true,
      },
    );

    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("Wrong shell");
    expect(result.content).not.toContain("share");
    expect(result.content).not.toContain("目录");
    expect(result.metadata.title).not.toMatch(/Example$/);
    expect(result.debug?.activeProfiles).toEqual(["demo"]);
  });

  it("fills missing metadata from common meta tags and JSON-LD", async () => {
    const result = await cleanHtml(
      `<!doctype html><html lang="en"><head>
        <meta property="og:title" content="Fallback Title">
        <meta name="description" content="Fallback description">
        <meta property="article:published_time" content="2025-01-02T03:04:05Z">
        <script type="application/ld+json">{"author":{"name":"JSON Author"}}</script>
      </head><body><article>${longParagraph()}</article></body></html>`,
      { baseUrl: "https://example.com/post" },
    );

    expect(result.metadata.title).toBe("Fallback Title");
    expect(result.metadata.description).toBe("Fallback description");
    expect(result.metadata.published).toBe("2025-01-02T03:04:05Z");
    expect(result.metadata.author).toBe("JSON Author");
    expect(result.metadata.language).toBe("en");
  });

  it("loads standard site profiles from user-provided TOML files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-ts-profiles-"));
    const path = join(dir, "demo.toml");
    try {
      await writeFile(
        path,
        '[match]\nhost_suffixes = ["example.com"]\n\n[extract]\nselectors = ["#content"]\n\n[clean.remove]\ntext_contains = ["remove me"]\n',
        "utf8",
      );
      const profiles = await loadSiteProfiles([path]);
      const result = await cleanHtml(`<div id="content">${longParagraph()}<p>remove me</p></div>`, {
        baseUrl: "https://example.com/post",
        profiles,
      });

      expect(profiles[0]?.name).toBe("demo");
      expect(result.content).toContain("meaningful article text");
      expect(result.content).not.toContain("remove me");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
});
