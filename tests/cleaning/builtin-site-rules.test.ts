import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { cleanHtml } from "../../src/cleaning/clean-html.js";
import { loadSiteProfiles } from "../../src/cleaning/profiles.js";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const builtinRulePaths = [join(repoRoot, "src", "site-rules", "wechat.toml"), join(repoRoot, "src", "site-rules", "zhihu.toml")];

function longParagraph(): string {
  return `<p>${"This is meaningful article text, ".repeat(80)}</p>`;
}

describe("built-in TOML site rules", () => {
  it("loads common site profiles from bundled TOML files", async () => {
    const profiles = await loadSiteProfiles(builtinRulePaths);

    expect(profiles.map((profile) => profile.name)).toEqual(["wechat", "zhihu"]);
    expect(profiles.find((profile) => profile.name === "wechat")?.content?.selectors).toContain("#js_content");
    expect(profiles.find((profile) => profile.name === "zhihu")?.metadata?.titleSuffixPatterns).toContain("\\s*-\\s*知乎\\s*$");
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
