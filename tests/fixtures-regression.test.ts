import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

import { cleanHtml } from "../src/cleaning/clean-html.js";
import { loadSiteProfiles } from "../src/cleaning/profiles.js";
import { htmlToMarkdown } from "../src/render/markdown.js";

async function profiles() {
  return loadSiteProfiles([
    "src/site-rules/kaggle.toml",
    "src/site-rules/wechat.toml",
    "src/site-rules/zhihu.toml",
  ]);
}

describe("fixture regressions", () => {
  it("extracts Kaggle writeup without cookie/comment noise", async () => {
    const html = await readFile("../tests/fixtures/kaggle_writeup_trimmed.html", "utf8");
    const result = await cleanHtml(html, { baseUrl: "https://www.kaggle.com/competitions/demo/writeups/solution", profiles: await profiles() });
    const md = htmlToMarkdown(result.content);
    expect(md).toContain("Acknowledgements");
    expect(md).toContain("Overview");
    expect(md).not.toContain("Kaggle uses cookies");
    expect(md).not.toContain("replyReply");
  });

  it("extracts WeChat article body", async () => {
    const html = await readFile("../tests/fixtures/wechat_article_trimmed.html", "utf8");
    const result = await cleanHtml(html, { baseUrl: "https://mp.weixin.qq.com/s/demo", profiles: await profiles() });
    const md = htmlToMarkdown(result.content);
    expect(result.metadata.title).toContain("A Visual Guide to Mamba");
    expect(md).toContain("Transformer 架构");
    expect(md).toContain("Mamba");
    expect(md.length).toBeGreaterThan(1000);
  });

  it("extracts Zhihu article body without action-bar/ad noise", async () => {
    const html = await readFile("../tests/fixtures/zhihu_article_trimmed.html", "utf8");
    const result = await cleanHtml(html, { baseUrl: "https://zhuanlan.zhihu.com/p/1993358891099111451", profiles: await profiles() });
    const md = htmlToMarkdown(result.content);
    expect(md).toContain("planning-with-files");
    expect(md).toContain("上下文工程");
    expect(md).not.toContain("ima让跨地域沟通无界限");
    expect(md).not.toContain("申请转载");
  });
});
