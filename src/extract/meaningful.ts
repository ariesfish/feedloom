import { parseHTML } from "linkedom";

const PRELOADED_MARKDOWN_RE = /window\.preloadPage\s*=\s*f\((['"])(.*?)\1\)/;

export function extractPreloadedMarkdownUrl(html: string, baseUrl: string): string | null {
  const match = PRELOADED_MARKDOWN_RE.exec(html);
  const rawUrl = match?.[2]?.trim();
  if (!rawUrl) {
    return null;
  }
  return new URL(rawUrl, baseUrl).toString();
}

function removeNoise(document: Document): void {
  document.querySelectorAll("script, style, noscript, svg, iframe").forEach((element) => element.remove());
}

function normalizedTextLength(element: Element | Document | null): number {
  return (element?.textContent ?? "").replace(/\s+/g, " ").trim().length;
}

export function visibleTextLength(html: string): number {
  const { document } = parseHTML(html);
  removeNoise(document);
  return normalizedTextLength(document.body);
}

export function htmlHasMeaningfulContent(url: string, html: string): boolean {
  if (extractPreloadedMarkdownUrl(html, url) !== null) {
    return true;
  }

  const { document } = parseHTML(html);
  removeNoise(document);

  const selectors = ["#js_content", "article", "main", "section", "div", "body"];
  let bestLength = 0;
  for (const selector of selectors) {
    document.querySelectorAll(selector).forEach((element) => {
      bestLength = Math.max(bestLength, normalizedTextLength(element));
    });
    if (bestLength >= 600 && selector !== "div") {
      return true;
    }
  }

  return bestLength >= 600;
}
