import { parseHTML } from "linkedom";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";

function normalizeImageReferences(markdown: string): string {
  return markdown.replace(/!\[([^\]]*)\]\(<([^>]+)>\)(?:\{[^}]*\})?/g, (_match, alt: string, url: string) => {
    return `![${alt}](${url})`;
  });
}

function cleanupMarkdown(markdown: string): string {
  return normalizeImageReferences(markdown)
    .replace(/^\s*content_copy\s*$/gim, "")
    .replace(/^●●●\n\n```\n([\s\S]*?)\n```\n\n└$/gm, (_match, code: string) => `\`\`\`\n●●●\n\n${code}\n\n└\n\`\`\``)
    .replace(/\[\s*\]\((?:#|javascript:void\(0\)|javascript:;)\)/gi, "")
    .replace(/(^|[^\\])\$(?=\d)/g, "$1\\$")
    .replace(/\n\s*\n\s*([-*+]\s)/g, "\n$1")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function htmlFragmentText(fragment: string): string {
  const { document } = parseHTML(`<!doctype html><html><body>${fragment}</body></html>`);
  document.querySelectorAll("br").forEach((br) => br.replaceWith(document.createTextNode("\n")));
  return document.body.textContent ?? "";
}

function fencedCodeHtml(text: string): string {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<pre><code>${escaped}</code></pre>`;
}

function normalizeTableCellHtml(html: string): string {
  return html
    .replace(/<(t[hd])\b([^>]*)>\s*<section\b[^>]*>([\s\S]*?)<\/section>\s*<\/t[hd]>/gi, "<$1$2>$3</$1>")
    .replace(/Input（<span\b[^>]*class=["']math inline["'][^>]*>\s*\/\s*<em>M<\/em>\s*<em>t<\/em>\s*<em>o<\/em>\s*<em>k<\/em>\s*<em>e<\/em>\s*<em>n<\/em>\s*<em>s<\/em>\s*）\s*\|\s*<em>O<\/em>\s*<em>u<\/em>\s*<em>t<\/em>\s*<em>p<\/em>\s*<em>u<\/em>\s*<em>t<\/em>\s*（<\/span>\s*\/M\s*tokens）/gi, "Input（/M tokens）</th><th style=\"text-align: right;\">Output（/M tokens）")
    .replace(/<th\b[^>]*>\s*<\/th>/gi, "");
}

function normalizeBlockCodeHtml(html: string): string {
  return html.replace(/<code\b[^>]*>(((?:(?!<\/code>)[\s\S])*<br\b(?:(?!<\/code>)[\s\S])*))<\/code>/gi, (_match, codeInnerHtml: string) => {
    return fencedCodeHtml(htmlFragmentText(codeInnerHtml).replace(/\n$/, ""));
  });
}

export function htmlToMarkdown(html: string): string {
  const turndown = new TurndownService({
    headingStyle: "atx",
    codeBlockStyle: "fenced",
    bulletListMarker: "-",
  });
  turndown.use(gfm);
  turndown.addRule("dropEmptyLinks", {
    filter: (node) => node.nodeName === "A" && !node.textContent?.trim(),
    replacement: () => "",
  });
  turndown.addRule("blockCodeElement", {
    filter: (node) => node.nodeName === "CODE" && node.parentNode?.nodeName !== "PRE" && Boolean(node.querySelector?.("br")),
    replacement: (_content, node) => {
      return `\n\n\`\`\`\n${node.textContent?.replace(/\n$/, "") ?? ""}\n\`\`\`\n\n`;
    },
  });
  turndown.addRule("preserveCodeLanguage", {
    filter: (node) => node.nodeName === "PRE" && node.firstChild?.nodeName === "CODE",
    replacement: (_content, node) => {
      const code = node.firstChild as HTMLElement;
      const className = code.getAttribute("class") ?? "";
      const language = className.match(/language-([\w-]+)/)?.[1] ?? "";
      return `\n\n\`\`\`${language}\n${code.textContent?.replace(/\n$/, "") ?? ""}\n\`\`\`\n\n`;
    },
  });
  return `${cleanupMarkdown(turndown.turndown(normalizeBlockCodeHtml(normalizeTableCellHtml(html))))}\n`;
}
