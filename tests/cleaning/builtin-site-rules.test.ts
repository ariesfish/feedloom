import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cleanHtml } from "../../src/cleaning/clean-html.js";
import { loadSiteProfiles } from "../../src/cleaning/profiles.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const builtinRulePaths = [
  join(repoRoot, "src", "site-rules", "kexue.toml"),
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

    expect(profiles.map((profile) => profile.name)).toEqual(["kexue", "wechat", "x", "xiaohongshu", "youtube", "vllm", "zhihu"]);
    expect(profiles.find((profile) => profile.name === "wechat")?.content?.selectors).toContain("#js_content");
    expect(profiles.find((profile) => profile.name === "kexue")?.content?.selectors).toEqual(["#PostContent"]);
    expect(profiles.find((profile) => profile.name === "kexue")?.extraction).toMatchObject({
      requireText: true,
    });
    expect(profiles.find((profile) => profile.name === "kexue")?.fetch).toMatchObject({
      mode: "browser",
      waitMs: 3000,
    });
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

  it("applies bundled kexue.fm extraction scoped to #PostContent", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);
    const result = await cleanHtml(
      `<!doctype html><html><body>
        <div id="content">
          <div id="breadcrumb"><a href="/">首页</a> <a href="/category/Big-Data">信息时代</a> 科学空间文章</div>
          <div class="Post">
            <h1>科学空间文章</h1>
            <p class="meta">13 May By 苏剑林 | 2024-05-13 | 402124位读者</p>
            <div class="PostContent" id="PostContent">
              ${longParagraph()}
              <p><em>转载到请包括本文地址：</em><a href="https://kexue.fm/archives/10091">link</a></p>
            </div>
          </div>
          <div id="tools">分类：信息时代 标签：优化</div>
          <div id="entrynavigation">< Cool Papers更新 | 重温SSM ></div>
          <div id="similar"><p>你也许还对下面的内容感兴趣</p><ul><li>相关文章 A</li></ul></div>
          <div id="PostComment">发表你的看法</div>
          <div id="comments">评论内容</div>
        </div>
      </body></html>`,
      { baseUrl: "https://kexue.fm/archives/10091", profiles },
    );

    expect(result.content).toContain("meaningful article text");
    expect(result.content).not.toContain("首页");
    expect(result.content).not.toContain("信息时代");
    expect(result.content).not.toContain("13 May");
    expect(result.content).not.toContain("By 苏剑林");
    expect(result.content).not.toContain("402124位读者");
    expect(result.content).not.toContain("分类：");
    expect(result.content).not.toContain("标签：");
    expect(result.content).not.toContain("Cool Papers更新");
    expect(result.content).not.toContain("你也许还对");
    expect(result.content).not.toContain("相关文章 A");
    expect(result.content).not.toContain("发表你的看法");
    expect(result.content).not.toContain("转载到请包括本文地址");
  });
});
