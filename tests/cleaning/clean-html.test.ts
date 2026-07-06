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

  it("truncates from the top-level section containing a nested marker", async () => {
    const profile = profileFromTomlRule("demo", {
      match: { host_suffixes: ["example.com"] },
      extract: { selectors: ["#content"] },
      clean: { truncate: { after_contains: ["Newsletter marker"] } },
    });

    const result = await cleanHtml(
      `<main id="content">
        <article>${longParagraph()}</article>
        <section class="signup-box"><div><h2>Newsletter marker</h2></div><p>signup form</p></section>
        <footer>footer after marker</footer>
      </main>`,
      { baseUrl: "https://example.com/post", profiles: [profile] },
    );

    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("Newsletter marker");
    expect(result.content).not.toContain("signup form");
    expect(result.content).not.toContain("footer after marker");
  });

  it("truncates only the marker paragraph and its siblings when the marker has preceding content", async () => {
    // Regression: a marker that sits deep inside a content div with many
    // preceding siblings must not promote the cut point up to an ancestor
    // (which would delete the whole article body).
    const profile = profileFromTomlRule("demo", {
      match: { host_suffixes: ["example.com"] },
      extract: { selectors: ["#content"] },
      clean: { truncate: { after_contains: ["Repost marker"] } },
    });

    const result = await cleanHtml(
      `<main id="content">
        <article>
          <p>first paragraph of the article</p>
          ${longParagraph()}
          <p>Repost marker with address</p>
          <p>tail noise one</p>
          <p>tail noise two</p>
        </article>
      </main>`,
      { baseUrl: "https://example.com/post", profiles: [profile] },
    );

    expect(result.content).toContain("first paragraph of the article");
    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("Repost marker");
    expect(result.content).not.toContain("tail noise one");
    expect(result.content).not.toContain("tail noise two");
  });

  it("fills missing author metadata from site profile selectors", async () => {
    const profile = profileFromTomlRule("demo", {
      match: { host_suffixes: ["example.com"] },
      metadata: { author_selectors: [".byline .name"] },
    });

    const result = await cleanHtml(
      `<!doctype html><html><head><title>Profile Author</title></head><body>
        <article>
          <p class="byline">By <span class="name">Site Author</span></p>
          ${longParagraph()}
        </article>
      </body></html>`,
      { baseUrl: "https://example.com/post", profiles: [profile] },
    );

    expect(result.metadata.author).toBe("Site Author");
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

  it("appends profile-enabled meta images to extracted content", async () => {
    const profile = profileFromTomlRule("demo", {
      match: { host_suffixes: ["example.com"] },
      extract: { selectors: ["#content"] },
      media: { include_meta_images: true, image_meta_properties: ["og:image"] },
    });

    const result = await cleanHtml(
      `<!doctype html><html><head>
        <meta property="og:image" content="https://cdn.example.com/a.jpg">
        <meta property="og:image" content="https://cdn.example.com/b.jpg">
      </head><body><div id="content">${longParagraph()}</div></body></html>`,
      { baseUrl: "https://example.com/post", profiles: [profile] },
    );

    expect(result.content).toContain('src="https://cdn.example.com/a.jpg"');
    expect(result.content).toContain('src="https://cdn.example.com/b.jpg"');
  });

  it("installs linkedom DOM globals required by procedural Defuddle extractors", async () => {
    const originalNode = globalThis.Node;
    try {
      Reflect.deleteProperty(globalThis, "Node");
      const result = await cleanHtml(
        `<!doctype html><html><head><title>Post / X</title></head><body>
          <div data-testid="cellInnerDiv">
            <article data-testid="tweet">
              <div data-testid="User-Name"><span>@alice</span></div>
              <div data-testid="tweetText">${"Long post text ".repeat(80)}</div>
            </article>
          </div>
        </body></html>`,
        { baseUrl: "https://x.com/alice/status/1" },
      );

      expect(globalThis.Node).toBeTruthy();
      expect(result.content).toContain("Long post text");
      expect(result.metadata.title).toContain("Post");
    } finally {
      globalThis.Node = originalNode;
    }
  });

  it("loads standard site profiles from user-provided TOML files", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-profiles-"));
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

  it("rewrites MathJax script sources into placeholder spans and drops rendered output", async () => {
    const result = await cleanHtml(
      `<!doctype html>
      <html>
        <head><title>Math Article</title></head>
        <body>
          <nav>menu</nav>
          <article>
            <h1>Math Article</h1>
            ${longParagraph()}
            <p>inline formula <span class="MathJax_Preview"></span><span class="MathJax"><span class="math"><math><mi>x</mi></math></span></span><script type="math/tex">\\boldsymbol{x}_1</script> here.</p>
            <div class="MathJax_Display"><span class="MathJax"><span class="math"><math><mi>y</mi></math></span></span></div><script type="math/tex; mode=display">\\begin{equation} y = mx \\end{equation}</script>
            ${longParagraph()}
          </article>
        </body>
      </html>`,
      { baseUrl: "https://example.com/math" },
    );

    expect(result.content).toContain('data-feedloom-math="inline"');
    expect(result.content).toContain('data-feedloom-math="display"');
    const inlinePlaceholder = result.content.match(/<span data-feedloom-math="inline">([\s\S]*?)<\/span>/);
    expect(inlinePlaceholder?.[1]).toContain("\\boldsymbol{x}_1");
    const displayPlaceholder = result.content.match(/<span data-feedloom-math="display">([\s\S]*?)<\/span>/);
    expect(displayPlaceholder?.[1]).toContain("\\begin{equation}");
    expect(result.content).not.toContain('class="MathJax');
    expect(result.content).not.toContain("<math");
    expect(result.content).not.toContain("MathJax_Preview");
    expect(result.content).not.toContain("math/tex");
  });
});
