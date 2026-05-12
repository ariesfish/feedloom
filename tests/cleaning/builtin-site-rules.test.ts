import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cleanHtml } from "../../src/cleaning/clean-html.js";
import { loadSiteProfiles } from "../../src/cleaning/profiles.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const builtinRulePaths = [
  join(repoRoot, "src", "site-rules", "wechat.toml"),
  join(repoRoot, "src", "site-rules", "x.toml"),
  join(repoRoot, "src", "site-rules", "xiaohongshu.toml"),
  join(repoRoot, "src", "site-rules", "youtube.toml"),
  join(repoRoot, "src", "site-rules", "vllm.toml"),
  join(repoRoot, "src", "site-rules", "zhihu.toml"),
];

function longParagraph(): string {
  return `<p>${"This is meaningful article text, ".repeat(80)}</p>`;
}

describe("built-in TOML site rules", () => {
  it("loads common site profiles from bundled TOML files", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);

    expect(profiles.map((profile) => profile.name)).toEqual(["wechat", "x", "xiaohongshu", "youtube", "vllm", "zhihu"]);
    expect(profiles.find((profile) => profile.name === "wechat")?.content?.selectors).toContain("#js_content");
    expect(profiles.find((profile) => profile.name === "zhihu")?.metadata?.titleSuffixPatterns).toContain("\\s*-\\s*知乎\\s*$");
    expect(profiles.find((profile) => profile.name === "xiaohongshu")?.media).toMatchObject({
      includeMetaImages: true,
      imageMetaProperties: ["og:image"],
    });
    expect(profiles.find((profile) => profile.name === "youtube")?.fetch).toMatchObject({
      mode: "auto",
      useProxyEnv: true,
    });
    expect(profiles.find((profile) => profile.name === "x")?.fetch).toMatchObject({
      mode: "browser",
      scrollToBottom: true,
      waitMs: 8000,
      useProxyEnv: true,
    });
    expect(profiles.find((profile) => profile.name === "youtube")?.extraction).toMatchObject({
      requireText: true,
    });
    expect(profiles.find((profile) => profile.name === "x")?.extraction).toMatchObject({
      requireText: true,
    });
    expect(profiles.find((profile) => profile.name === "vllm")?.content?.selectors).toEqual(["article.max-w-3xl"]);
    expect(profiles.find((profile) => profile.name === "vllm")?.fetch).toMatchObject({
      mode: "browser",
      waitMs: 3000,
      waitSelector: "article.max-w-3xl",
      waitSelectorState: "attached",
    });
    expect(profiles.find((profile) => profile.name === "vllm")?.extraction).toMatchObject({
      requireText: true,
    });
    expect(profiles.find((profile) => profile.name === "zhihu")?.fetch).toMatchObject({
      mode: "browser",
      preferBrowserState: true,
      scrollToBottom: true,
      waitMs: 8000,
    });
  });

  it("applies bundled WeChat profile extraction", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);
    const result = await cleanHtml(
      `<!doctype html><html><body>
        <div class="chrome">navigation should not be selected ${longParagraph()}</div>
        <div id="js_content"><h1>WeChat Article</h1>${longParagraph()}</div>
      </body></html>`,
      { baseUrl: "https://mp.weixin.qq.com/s/example", profiles },
    );

    expect(result.content).toContain("WeChat Article");
    expect(result.content).not.toContain("navigation should not be selected");
  });

  it("applies bundled vLLM profile extraction and cleanup", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);
    const result = await cleanHtml(
      `<!doctype html><html><body>
        <main>site chrome ${longParagraph()}</main>
        <article class="max-w-3xl">
          <h1>vLLM Article</h1>
          ${longParagraph()}
          <p>Share:</p>
          <p>Related Posts</p>
          <p>tail noise</p>
        </article>
      </body></html>`,
      { baseUrl: "https://vllm.ai/blog/deepseek-v4", profiles },
    );

    expect(result.content).toContain("vLLM Article");
    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("site chrome");
    expect(result.content).not.toContain("Share:");
    expect(result.content).not.toContain("Related Posts");
    expect(result.content).not.toContain("tail noise");
  });

  it("applies bundled Zhihu profile cleanup", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);
    const result = await cleanHtml(
      `<!doctype html><html><head><title>Zhihu Demo - 知乎</title></head><body>
        <main class="Post-RichTextContainer">
          <h1>Zhihu Demo</h1>
          ${longParagraph()}
          <div class="RichText-LinkCardContainer">link card noise</div>
          <p>目录</p>
          <p>发布于 2025-01-02 12:00</p>
          <p>tail noise</p>
        </main>
      </body></html>`,
      { baseUrl: "https://www.zhihu.com/question/1/answer/2", profiles },
    );

    expect(result.metadata.title).toBe("Zhihu Demo");
    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("link card noise");
    expect(result.content).not.toContain("目录");
    expect(result.content).not.toContain("发布于");
    expect(result.content).not.toContain("tail noise");
  });
});
