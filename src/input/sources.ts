import { XMLParser } from "fast-xml-parser";

import { makeUrlItem, type UrlItem } from "../models.js";

const FEED_HINT_RE = /(?:^|\/)(?:feed|rss|atom)(?:$|[./?])/i;

export type SourceKind = "auto" | "html-page" | "rss-feed";

export function looksLikeFeedUrl(url: string): boolean {
  const parsed = new URL(url);
  const path = parsed.pathname.toLowerCase();
  return (
    FEED_HINT_RE.test(path) ||
    path.endsWith(".xml") ||
    path.endsWith(".rss") ||
    path.endsWith(".atom") ||
    parsed.search.slice(1).toLowerCase().startsWith("feed=")
  );
}

export async function fetchSourceText(url: string, timeoutMs = 60_000): Promise<string> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: { "user-agent": "Mozilla/5.0" },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return await response.text();
  } finally {
    clearTimeout(timeout);
  }
}

export function parseDateTime(value: string | undefined): Date | undefined {
  const raw = value?.trim();
  if (!raw) {
    return undefined;
  }
  const normalized = raw.endsWith("Z") ? raw : raw;
  const timestamp = Date.parse(normalized);
  if (Number.isNaN(timestamp)) {
    return undefined;
  }
  return new Date(timestamp);
}

export function parseSinceDate(value: string): Date {
  const raw = value.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    throw new Error(`Invalid --since date: ${value}. Use YYYY-MM-DD.`);
  }
  const date = new Date(`${raw}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid --since date: ${value}. Use YYYY-MM-DD.`);
  }
  return date;
}

type XmlValue = string | number | boolean | Record<string, unknown> | Array<unknown> | null | undefined;

function asObject(value: XmlValue): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : undefined;
}

function asArray(value: XmlValue): unknown[] {
  if (value === undefined || value === null) {
    return [];
  }
  return Array.isArray(value) ? value : [value];
}

function textValue(value: XmlValue): string {
  if (value === undefined || value === null) {
    return "";
  }
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value).trim();
  }
  const object = asObject(value);
  if (!object) {
    return "";
  }
  const text = object["#text"] ?? object.text;
  return textValue(text as XmlValue);
}

function childText(node: Record<string, unknown>, ...names: string[]): string {
  for (const name of names) {
    const value = node[name];
    const text = textValue(value as XmlValue);
    if (text) {
      return text;
    }
  }
  return "";
}

function atomEntryLink(entry: Record<string, unknown>): string {
  for (const rawLink of asArray(entry.link as XmlValue)) {
    if (typeof rawLink === "string") {
      return rawLink.trim();
    }
    const link = asObject(rawLink as XmlValue);
    if (!link) {
      continue;
    }
    const href = textValue((link.href ?? link["@_href"]) as XmlValue);
    const rel = textValue((link.rel ?? link["@_rel"] ?? "alternate") as XmlValue).toLowerCase();
    if (href && (rel === "" || rel === "alternate")) {
      return href;
    }
  }
  return "";
}

function entryPublishedAt(node: Record<string, unknown>): Date | undefined {
  return parseDateTime(childText(node, "published", "updated", "pubDate", "date"));
}

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: "@_",
  removeNSPrefix: true,
  trimValues: true,
});

export function parseFeedEntries(xmlText: string, sourceUrl: string): UrlItem[] {
  const parsed = parser.parse(xmlText) as Record<string, unknown>;
  if (asObject(parsed.rss as XmlValue)) {
    const rss = asObject(parsed.rss as XmlValue)!;
    const channel = asObject(rss.channel as XmlValue);
    if (!channel) {
      return [];
    }
    const feedTitle = childText(channel, "title");
    return asArray(channel.item as XmlValue)
      .map((rawItem) => asObject(rawItem as XmlValue))
      .filter((item): item is Record<string, unknown> => item !== undefined)
      .map((item) => {
        const link = childText(item, "link");
        if (!link) {
          return undefined;
        }
        return makeUrlItem(new URL(link, sourceUrl).toString(), {
          inputUrl: sourceUrl,
          sourceKind: "html-page",
          discoveredFrom: sourceUrl,
          sourceTitle: feedTitle || childText(item, "title"),
          publishedAt: entryPublishedAt(item),
        });
      })
      .filter((item): item is UrlItem => item !== undefined);
  }

  if (asObject(parsed.feed as XmlValue)) {
    const feed = asObject(parsed.feed as XmlValue)!;
    const feedTitle = childText(feed, "title");
    return asArray(feed.entry as XmlValue)
      .map((rawEntry) => asObject(rawEntry as XmlValue))
      .filter((entry): entry is Record<string, unknown> => entry !== undefined)
      .map((entry) => {
        const link = atomEntryLink(entry);
        if (!link) {
          return undefined;
        }
        return makeUrlItem(new URL(link, sourceUrl).toString(), {
          inputUrl: sourceUrl,
          sourceKind: "html-page",
          discoveredFrom: sourceUrl,
          sourceTitle: feedTitle || childText(entry, "title"),
          publishedAt: entryPublishedAt(entry),
        });
      })
      .filter((item): item is UrlItem => item !== undefined);
  }

  throw new Error("Unsupported feed format");
}

export interface ExpandSourceItemsOptions {
  fetchSource?: (url: string) => Promise<string>;
}

export async function expandSourceItems(
  items: UrlItem[],
  sourceKind: SourceKind,
  since?: Date,
  options: ExpandSourceItemsOptions = {},
): Promise<UrlItem[]> {
  const expanded: UrlItem[] = [];
  const seen = new Set<string>();
  const fetchSource = options.fetchSource ?? fetchSourceText;

  for (const item of items) {
    const kinds: SourceKind[] =
      sourceKind === "auto" ? (looksLikeFeedUrl(item.url) ? ["rss-feed", "html-page"] : ["html-page"]) : [sourceKind];
    let produced: UrlItem[] | undefined;
    let lastError: unknown;

    for (const kind of kinds) {
      try {
        if (kind === "html-page") {
          produced = [item];
          break;
        }
        if (kind === "rss-feed") {
          if (sourceKind === "auto" && !looksLikeFeedUrl(item.url)) {
            continue;
          }
          const xmlText = await fetchSource(item.url);
          produced = parseFeedEntries(xmlText, item.url);
          if (produced.length > 0) {
            break;
          }
        }
      } catch (error) {
        lastError = error;
      }
    }

    if (produced === undefined) {
      if (sourceKind === "rss-feed" && lastError !== undefined) {
        throw lastError;
      }
      produced = [item];
    }

    for (const producedItem of produced) {
      producedItem.sourcePath = item.sourcePath;
      producedItem.lineNo = item.lineNo;
      producedItem.inputUrl = producedItem.inputUrl ?? item.url;
      if (since && producedItem.publishedAt && producedItem.publishedAt < since) {
        continue;
      }
      if (seen.has(producedItem.url)) {
        continue;
      }
      seen.add(producedItem.url);
      expanded.push(producedItem);
    }
  }

  return expanded;
}
