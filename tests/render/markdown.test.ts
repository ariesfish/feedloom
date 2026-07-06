import { describe, expect, it } from "vitest";

import { htmlToMarkdown } from "../../src/render/markdown.js";

describe("htmlToMarkdown math placeholders", () => {
  it("converts inline math placeholder to $...$ without escaping LaTeX", () => {
    const md = htmlToMarkdown(
      `<p>see <span data-feedloom-math="inline">\\boldsymbol{x}_1 * y</span> here</p>`,
    );
    expect(md).toContain("$\\boldsymbol{x}_1 * y$");
    // backslashes must not be doubled by Turndown text escaping
    expect(md).not.toContain("\\\\boldsymbol");
    // underscores must not be escaped
    expect(md).not.toMatch(/\\_[0-9]/);
  });

  it("converts display math placeholder to $$...$$ block", () => {
    const md = htmlToMarkdown(
      `<div><span data-feedloom-math="display">\\begin{equation} a = b \\end{equation}</span></div>`,
    );
    expect(md).toContain("$$\\begin{equation} a = b \\end{equation}$$");
    expect(md).not.toContain("\\\\begin");
  });

  it("preserves multiple inline formulas in one paragraph", () => {
    const md = htmlToMarkdown(
      `<p>a <span data-feedloom-math="inline">x</span> b <span data-feedloom-math="inline">y</span> c</p>`,
    );
    expect(md).toContain("$x$");
    expect(md).toContain("$y$");
  });

  it("leaves non-math spans untouched", () => {
    const md = htmlToMarkdown(`<p>plain <span class="highlight">text</span> here</p>`);
    expect(md).toContain("plain");
    expect(md).toContain("text");
    expect(md).not.toContain("$text$");
  });

  it("does not escape $ delimiters of inline math that starts with a digit", () => {
    // Reproduces kexue.fm regression: `$1 < g < h$` was turned into `\$1 < g < h$`
    // by the currency-escape rule, breaking pairing and swallowing following
    // links into a bogus math span.
    const md = htmlToMarkdown(
      `<p>当 <span data-feedloom-math="inline">1 &lt; g &lt; h</span> 时，详见 <a href="https://example.com/x">link</a>。</p>`,
    );
    expect(md).toContain("$1 < g < h$");
    expect(md).not.toContain("\\$1");
    expect(md).toContain("[link](https://example.com/x)");
  });

  it("still escapes currency $ before a digit outside math", () => {
    const md = htmlToMarkdown(`<p>price $100 each</p>`);
    expect(md).toContain("\\$100");
    expect(md).not.toMatch(/[^\\]\$100/);
  });

  it("keeps currency and digit-leading math apart in one paragraph", () => {
    const md = htmlToMarkdown(
      `<p>cost $5, and <span data-feedloom-math="inline">2x</span> items, ratio <span data-feedloom-math="inline">1/2</span>.</p>`,
    );
    expect(md).toContain("\\$5");
    expect(md).toContain("$2x$");
    expect(md).toContain("$1/2$");
  });
});
