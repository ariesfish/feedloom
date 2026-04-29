---
name: feedloom
description: Capture long-form web content, article URLs, URL list files, or RSS/Atom feeds into clean Markdown with local assets using the Feedloom CLI. Use for web clipping, saving articles as Markdown, archiving URL batches, clipping Zhihu/WeChat/Kaggle/blog posts, 抓取网页文章, 保存为 Markdown, URL 列表转归档, RSS 归档, and 网页长文归档.
---

# Feedloom

Use Feedloom for article clipping instead of writing ad-hoc scrapers.

## Command

```bash
npx -y @ariesfish/feedloom <inputs...> [options]
```

## Inputs

- Direct article URLs.
- Files containing URLs, one per line.
- Markdown checklist files with lines like `- [ ] <url>` or `- [x] <url>`.
- RSS/Atom feeds with `--source-kind rss-feed`.

## Common usage

```bash
npx -y @ariesfish/feedloom "https://example.com/article"
npx -y @ariesfish/feedloom urls.txt
npx -y @ariesfish/feedloom urls.txt --limit 10
npx -y @ariesfish/feedloom urls.txt --start 11 --end 20
npx -y @ariesfish/feedloom urls.txt --output-dir clippings
npx -y @ariesfish/feedloom "https://example.com/feed.xml" --source-kind rss-feed
npx -y @ariesfish/feedloom "https://example.com/feed.xml" --source-kind rss-feed --since 2026-01-01
npx -y @ariesfish/feedloom "https://example.com/article" --fetch-mode browser --wait-ms 4000 --scroll-to-bottom
npx -y @ariesfish/feedloom "https://example.com/article" --prefer-browser-state
```

## Fetch workflow

Use the least expensive mode that works:

1. Start with default `auto`. It tries meaningful content in order: `static` → `browser-state` when `--prefer-browser-state` is set → `browser` → `stealth`.
2. Use `--fetch-mode static` only for simple pages when speed matters and JavaScript/login state is unnecessary.
3. Use `--fetch-mode browser` for JavaScript-rendered pages; add `--wait-ms`, `--wait-selector`, `--click-selector`, or `--scroll-to-bottom` only when needed.
4. Use `--prefer-browser-state` with `--chrome-user-data-dir` / `--chrome-profile` for pages that need local login state.
5. Use `--fetch-mode stealth` only after static/browser fails or for anti-bot pages; add `--solve-cloudflare`, `--proxy`, or `--dns-over-https` only when required.
6. For batches, test one URL first, then run the list with the working options plus `--limit`, `--start`, or `--end` as needed.

## Useful options

- `--output-dir <dir>`: write notes and assets somewhere other than `clippings/`.
- `--source-kind rss-feed`: treat input as an RSS/Atom feed and archive feed entries.
- `--since <YYYY-MM-DD>`: limit RSS/Atom entries by date.
- `--limit <n>`, `--start <n>`, `--end <n>`: process URL lists in small batches or resume partway through a list.
- `--fetch-mode <static|browser|stealth>`: force a specific fetch layer when `auto` is too broad or too slow.
- `--prefer-browser-state`: try a copied local Chrome profile before regular browser fallback.
- `--wait-ms <ms>`, `--wait-selector <selector>`, `--scroll-to-bottom`: give dynamic pages time or actions to reveal article content.
- `--click-selector <selector...>`: click dismiss/expand selectors before extracting HTML.
- `--headful`: show the browser window for debugging login, popups, or dynamic loading.
- `--solve-cloudflare`, `--proxy <server>`, `--dns-over-https`: use only when stealth fetching needs them.

Run `npx -y @ariesfish/feedloom --help` for the complete option list. Do not invent unsupported options.

## Output

- Markdown files are written to `clippings/` by default, or to `--output-dir`.
- Assets are written under an `assets/` subdirectory.
- Successful Markdown checklist items are marked done.
