import * as DefuddleModule from "defuddle";
import { parseHTML } from "linkedom";

import { applyMetadataProfiles, applySiteProfiles } from "./profile-dom.js";
import { firstContentSelector, selectActiveProfiles } from "./profiles.js";
import type { FeedloomMetadata, HtmlCleaningOptions, HtmlCleaningResult, RemovalRecord, SiteProfile } from "./types.js";

const DEFAULT_FEEDLOOM_PROFILE: SiteProfile = {
  name: "feedloom-default",
  removals: {
    exactSelectors: [
      "script",
      "style",
      "noscript",
      ".share-buttons",
      ".social-share",
      ".newsletter",
      ".subscribe",
      ".related",
      ".comments",
    ],
    partialAttributePatterns: ["share", "newsletter", "subscribe", "related", "comment"],
  },
};

type DefuddleParseResult = {
  title?: string;
  description?: string;
  domain?: string;
  favicon?: string;
  image?: string;
  language?: string;
  published?: string;
  author?: string;
  site?: string;
  schemaOrgData?: unknown;
  wordCount?: number;
  parseTime?: number;
  content: string;
  contentMarkdown?: string;
  debug?: { contentSelector?: string; removals?: RemovalRecord[] };
};

type DefuddleParser = {
  parse(): DefuddleParseResult;
  parseAsync?: () => Promise<DefuddleParseResult>;
};
type DefuddleConstructor = new (document: Document, options?: Record<string, unknown>) => DefuddleParser;
const DefuddleClass = ((DefuddleModule as unknown as { default?: DefuddleConstructor; Defuddle?: DefuddleConstructor }).default ??
  (DefuddleModule as unknown as { Defuddle?: DefuddleConstructor }).Defuddle) as DefuddleConstructor;

function firstMetaContent(document: Document, names: string[]): string | undefined {
  for (const name of names) {
    const escaped = name.replace(/"/g, "\\\"");
    const element = document.querySelector(`meta[property="${escaped}"], meta[name="${escaped}"], meta[itemprop="${escaped}"]`);
    const content = element?.getAttribute("content")?.trim();
    if (content) return content;
  }
  return undefined;
}

function jsonLdValue(document: Document, keys: string[]): string | undefined {
  for (const script of Array.from(document.querySelectorAll('script[type="application/ld+json"]'))) {
    const text = script.textContent?.trim();
    if (!text) continue;
    try {
      const parsed = JSON.parse(text) as unknown;
      const nodes = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of nodes) {
        if (!node || typeof node !== "object") continue;
        for (const key of keys) {
          const value = (node as Record<string, unknown>)[key];
          if (typeof value === "string" && value.trim()) return value.trim();
          if (value && typeof value === "object" && typeof (value as Record<string, unknown>).name === "string") {
            return String((value as Record<string, unknown>).name).trim();
          }
        }
      }
    } catch {
      // Ignore malformed third-party JSON-LD.
    }
  }
  return undefined;
}

function toMetadata(result: DefuddleParseResult, document: Document): FeedloomMetadata {
  return {
    title: result.title || firstMetaContent(document, ["og:title", "twitter:title"]) || document.querySelector("title")?.textContent?.trim() || undefined,
    description: result.description || firstMetaContent(document, ["description", "og:description", "twitter:description"]),
    domain: result.domain || undefined,
    favicon: result.favicon || undefined,
    image: result.image || firstMetaContent(document, ["og:image", "twitter:image"]),
    language: result.language || document.documentElement.getAttribute("lang") || undefined,
    published: result.published || firstMetaContent(document, ["article:published_time", "date", "datePublished", "pubdate", "publishdate"]) || jsonLdValue(document, ["datePublished", "dateCreated"]),
    author: result.author || firstMetaContent(document, ["author", "article:author", "twitter:creator"]) || jsonLdValue(document, ["author", "creator"]),
    site: result.site || firstMetaContent(document, ["og:site_name", "application-name"]),
    schemaOrgData: result.schemaOrgData,
    wordCount: result.wordCount,
    parseTime: result.parseTime,
  };
}

function serializeProfiledContent(content: string, profiles: SiteProfile[], removals: RemovalRecord[]): string {
  const { document } = parseHTML(`<!doctype html><html><body><main data-feedloom-profile-root="true">${content}</main></body></html>`);
  const root = document.querySelector('[data-feedloom-profile-root="true"]') ?? document.body;
  applySiteProfiles(root, profiles, removals);
  const serialized = root.innerHTML || root.outerHTML || document.body.innerHTML;
  return serialized.trim() ? `${serialized.trim()}\n` : "";
}

export class HtmlCleaner {
  constructor(private readonly options: HtmlCleaningOptions = {}) {}

  async parse(rawHtml: string): Promise<HtmlCleaningResult> {
    const activeProfiles = this.options.activeProfiles ?? selectActiveProfiles(this.options.profiles, this.options.baseUrl, rawHtml);
    const postProfiles = [DEFAULT_FEEDLOOM_PROFILE, ...activeProfiles];
    const preferredContentSelector = this.options.contentSelector ?? firstContentSelector(activeProfiles);
    const removals: RemovalRecord[] = [];

    const html = /<html[\s>]/i.test(rawHtml) ? rawHtml : `<!doctype html><html><body>${rawHtml}</body></html>`;

    const { document } = parseHTML(html);
    const contentSelector = preferredContentSelector && document.querySelector(preferredContentSelector) ? preferredContentSelector : undefined;
    const doc = document as Document & { URL?: string };
    if (this.options.baseUrl) {
      doc.URL = this.options.baseUrl;
    }
    if (!(doc as unknown as { styleSheets?: unknown }).styleSheets) {
      (doc as unknown as { styleSheets: unknown[] }).styleSheets = [];
    }

    const parser = new DefuddleClass(doc, {
      url: this.options.baseUrl,
      debug: this.options.debug,
      contentSelector,
      removeSmallImages: this.options.removeSmallImages,
      removeHiddenElements: this.options.removeHiddenElements,
      removeLowScoring: this.options.removeLowScoring,
      removeExactSelectors: this.options.removeExactSelectors,
      removePartialSelectors: this.options.removePartialSelectors,
      removeContentPatterns: this.options.removeContentPatterns,
      standardize: this.options.standardize,
    });
    const result = parser.parseAsync ? await parser.parseAsync() : parser.parse();

    const metadata = toMetadata(result, document);
    applyMetadataProfiles(metadata, activeProfiles);
    const content = serializeProfiledContent(result.content, postProfiles, removals);

    return {
      content,
      contentMarkdown: result.contentMarkdown,
      metadata,
      debug: this.options.debug
        ? {
            contentSelector: result.debug?.contentSelector ?? contentSelector ?? preferredContentSelector,
            activeProfiles: activeProfiles.map((profile) => profile.name),
            removals: [...(result.debug?.removals ?? []), ...removals],
          }
        : undefined,
    };
  }
}

export async function cleanHtml(rawHtml: string, options: HtmlCleaningOptions = {}): Promise<HtmlCleaningResult> {
  return new HtmlCleaner(options).parse(rawHtml);
}
