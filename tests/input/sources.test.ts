import { describe, expect, it } from "vitest";

import {
  expandSourceItems,
  looksLikeFeedUrl,
  parseFeedEntries,
  parseSinceDate,
} from "../../src/input/sources.js";
import { makeUrlItem } from "../../src/models.js";

const RSS_XML = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Demo Feed</title>
    <item>
      <title>First Post</title>
      <link>https://example.com/posts/1</link>
    </item>
    <item>
      <title>Second Post</title>
      <link>https://example.com/posts/2</link>
    </item>
  </channel>
</rss>`;

const RSS_DATED_XML = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0">
  <channel>
    <title>Demo Feed</title>
    <item>
      <title>Dated Post</title>
      <link>https://example.com/posts/dated</link>
      <pubDate>Thu, 15 Jan 2026 12:00:00 GMT</pubDate>
    </item>
  </channel>
</rss>`;

const ATOM_XML = `<?xml version="1.0" encoding="utf-8"?>
<feed xmlns="http://www.w3.org/2005/Atom">
  <title>Atom Feed</title>
  <entry>
    <title>Entry One</title>
    <link rel="alternate" href="https://example.com/atom/1" />
    <published>2026-01-15T12:00:00+00:00</published>
  </entry>
</feed>`;

describe("looksLikeFeedUrl", () => {
  it("recognizes common feed URLs", () => {
    expect(looksLikeFeedUrl("https://example.com/feed.xml")).toBe(true);
    expect(looksLikeFeedUrl("https://example.com/posts/1")).toBe(false);
  });
});

describe("parseFeedEntries", () => {
  it("parses RSS feed entries", () => {
    const items = parseFeedEntries(RSS_XML, "https://example.com/feed.xml");
    expect(items.map((item) => item.url)).toEqual([
      "https://example.com/posts/1",
      "https://example.com/posts/2",
    ]);
    expect(items.every((item) => item.inputUrl === "https://example.com/feed.xml")).toBe(true);
    expect(items.every((item) => item.discoveredFrom === "https://example.com/feed.xml")).toBe(true);
  });

  it("parses Atom feed entries", () => {
    const items = parseFeedEntries(ATOM_XML, "https://example.com/atom.xml");
    expect(items).toHaveLength(1);
    expect(items[0]?.url).toBe("https://example.com/atom/1");
    expect(items[0]?.sourceTitle).toBe("Atom Feed");
    expect(items[0]?.publishedAt?.toISOString()).toBe("2026-01-15T12:00:00.000Z");
  });
});

describe("expandSourceItems", () => {
  it("auto-expands feed URLs", async () => {
    const expanded = await expandSourceItems([makeUrlItem("https://example.com/feed.xml")], "auto", undefined, {
      fetchSource: async () => RSS_XML,
    });
    expect(expanded).toHaveLength(2);
    expect(expanded[0]?.inputUrl).toBe("https://example.com/feed.xml");
  });

  it("filters by since date", async () => {
    const inputs = [makeUrlItem("https://example.com/atom.xml")];
    const expanded = await expandSourceItems(inputs, "rss-feed", parseSinceDate("2026-01-01"), {
      fetchSource: async () => ATOM_XML,
    });
    expect(expanded).toHaveLength(1);

    const filtered = await expandSourceItems(inputs, "rss-feed", parseSinceDate("2026-02-01"), {
      fetchSource: async () => ATOM_XML,
    });
    expect(filtered).toEqual([]);
  });

  it("filters RSS entries by RFC 822 pubDate", async () => {
    const inputs = [makeUrlItem("https://example.com/feed.xml")];
    const expanded = await expandSourceItems(inputs, "rss-feed", parseSinceDate("2026-01-01"), {
      fetchSource: async () => RSS_DATED_XML,
    });
    expect(expanded).toHaveLength(1);
    expect(expanded[0]?.publishedAt?.toISOString()).toBe("2026-01-15T12:00:00.000Z");

    const filtered = await expandSourceItems(inputs, "rss-feed", parseSinceDate("2026-02-01"), {
      fetchSource: async () => RSS_DATED_XML,
    });
    expect(filtered).toEqual([]);
  });

  it("preserves regular pages", async () => {
    const expanded = await expandSourceItems([makeUrlItem("https://example.com/posts/1")], "auto");
    expect(expanded.map((item) => item.url)).toEqual(["https://example.com/posts/1"]);
  });

  it("preserves source path and line number on expanded items", async () => {
    const item = makeUrlItem("https://example.com/feed.xml", { sourcePath: "/tmp/urls.md", lineNo: 7 });
    const expanded = await expandSourceItems([item], "rss-feed", undefined, { fetchSource: async () => RSS_XML });
    expect(expanded[0]?.sourcePath).toBe("/tmp/urls.md");
    expect(expanded[0]?.lineNo).toBe(7);
  });
});
