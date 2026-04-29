import { localizeImages } from "./assets.js";
import { cleanHtml } from "./cleaning/clean-html.js";
import { selectActiveProfiles } from "./cleaning/profiles.js";
import type { SiteProfile } from "./cleaning/types.js";
import { fetchHtml, type FetchHtmlOptions } from "./fetch/strategy.js";
import type { UrlItem } from "./models.js";
import { cleanupExistingNote, sanitizeFilename, writeMarkdownNote } from "./output.js";
import { htmlToMarkdown } from "./render/markdown.js";

export interface ProcessItemOptions extends FetchHtmlOptions {
  outputDir: string;
  profiles?: SiteProfile[];
  localizeAssets?: boolean;
  fetchImage?: typeof fetch;
}

export interface ProcessItemResult {
  item: UrlItem;
  outputPath: string;
  title: string;
}

function titleFromUrl(url: string): string {
  const parsed = new URL(url);
  const segment = parsed.pathname.split("/").filter(Boolean).pop();
  return decodeURIComponent(segment || parsed.hostname || "Untitled").replace(/[-_]+/g, " ").trim() || "Untitled";
}

function stripDuplicateLeadingHeading(markdown: string, title: string): string {
  const normalizedTitle = title.replace(/\s+/g, " ").trim().toLowerCase();
  return markdown.replace(/^#\s+(.+?)\s*\n+/, (match, heading: string) => {
    return heading.replace(/\s+/g, " ").trim().toLowerCase() === normalizedTitle ? "" : match;
  });
}

function stripLeadingDateLine(markdown: string): string {
  return markdown.replace(/^(?:Published\s+)?(?:\d{4}[-/.年]\d{1,2}[-/.月]\d{1,2}日?|[A-Z][a-z]+\s+\d{1,2},\s+\d{4})\s*\n+/i, "");
}

function demoteTopLevelHeadings(markdown: string): string {
  const lines = markdown.split("\n");
  let inFence = false;
  return lines.map((line) => {
    if (/^```/.test(line.trim())) {
      inFence = !inFence;
      return line;
    }
    if (!inFence && /^#(?!#)\s+/.test(line)) {
      return `#${line}`;
    }
    return line;
  }).join("\n");
}

function createdFromItemDate(date: Date): string {
  if (
    date.getUTCHours() === 0 &&
    date.getUTCMinutes() === 0 &&
    date.getUTCSeconds() === 0 &&
    date.getUTCMilliseconds() === 0
  ) {
    return date.toISOString().slice(0, 10);
  }
  return date.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function resolveCreatedValue(item: UrlItem, published: string | undefined): string {
  if (published?.trim()) return published.trim();
  if (item.publishedAt) return createdFromItemDate(item.publishedAt);
  return new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
}

export async function processItem(item: UrlItem, options: ProcessItemOptions): Promise<ProcessItemResult> {
  const html = await fetchHtml(item.url, options);
  const activeProfiles = selectActiveProfiles(options.profiles, item.url, html);
  const cleaned = await cleanHtml(html, { baseUrl: item.url, profiles: options.profiles, activeProfiles });
  const title = cleaned.metadata.title || item.sourceTitle || titleFromUrl(item.url);
  await cleanupExistingNote(options.outputDir, item.url);
  const contentHtml = options.localizeAssets === false
    ? cleaned.content
    : await localizeImages(cleaned.content, {
        outputDir: options.outputDir,
        noteSlug: sanitizeFilename(title),
        baseUrl: item.url,
        fetchImage: options.fetchImage,
      });
  const markdown = demoteTopLevelHeadings(stripLeadingDateLine(stripDuplicateLeadingHeading(htmlToMarkdown(contentHtml), title)));
  const outputPath = await writeMarkdownNote(options.outputDir, {
    sourceUrl: item.url,
    title,
    metadata: cleaned.metadata,
    markdown,
    created: resolveCreatedValue(item, cleaned.metadata.published),
  });
  return { item, outputPath, title };
}
