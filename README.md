# Feedloom

Feedloom is a command-line tool for archiving long-form web content. It takes article URLs, URL list files, or RSS/Atom feeds, extracts readable article content, converts it to Markdown with YAML frontmatter, and saves page images as local assets. It is designed for personal knowledge bases, notebook vaults, and offline reading archives.

## Features

- Accept one or more URLs directly from the command line.
- Extract URLs from text or Markdown files, with automatic deduplication.
- Expand RSS/Atom feeds and optionally filter entries by date.
- Clean article HTML and convert it to Markdown.
- Download and localize article images.
- Generate Markdown notes with `source`, `author`, and `created` frontmatter.
- Support static fetch, browser-rendered fetch, and stealth fetch modes.
- Optionally use a local Chrome profile for pages that require login state.
- Automatically mark Markdown checklist items as done after successful processing.

## Requirements

- Node.js >= 24
- npm
- macOS, Linux, or Windows should work; browser-based fetching depends on Patchright/Chromium.

## Installation

### 1. Clone the repository

```bash
git clone <this-repository-url>
cd feedloom
```

### 2. Install dependencies

```bash
npm install
```

### 3. Install the browser runtime

If you plan to use `browser`, `stealth`, or the browser fallback in `auto` mode, install the Patchright Chromium runtime:

```bash
npx patchright install chromium
```

### 4. Build the CLI

```bash
npm run build
```

After building, run:

```bash
node dist/cli.js --help
```

During development, you can run the TypeScript source directly:

```bash
npm run dev -- --help
```

To make the CLI available globally on your machine:

```bash
npm link
feedloom --help
```

## Agent Skill

Feedloom ships an Agent Skill in `skills/feedloom`, so agents that support the `skills` CLI can install the clipping workflow directly from the package or repository:

```bash
npx skills add @ariesfish/feedloom --skill feedloom
```

For a global install across supported agents:

```bash
npx skills add @ariesfish/feedloom --skill feedloom --global
```

After installing the skill, ask your agent to save article URLs, URL lists, or RSS feeds as Markdown. The skill runs the CLI through `npx -y @ariesfish/feedloom` by default.

## Quick Start

Archive a single article to the default `clippings/` directory:

```bash
npm run dev -- "https://example.com/article"
```

Write output to a custom directory:

```bash
npm run dev -- --output-dir ./outputs "https://example.com/article"
```

Use the built CLI:

```bash
node dist/cli.js --output-dir ./outputs "https://example.com/article"
```

The generated Markdown will look roughly like this:

```markdown
---
source: "https://example.com/article"
author: "Author Name"
created: "2026-04-29"
---

# Article Title

Article content...
```

Images are downloaded into an `assets/` subdirectory under the output directory and rewritten as local Markdown references.

## Input Methods

### Pass multiple URLs directly

```bash
npm run dev -- \
  "https://example.com/a" \
  "https://example.com/b"
```

### Read URLs from a file

`urls.md` can be a plain URL list or a Markdown checklist:

```markdown
- [ ] https://example.com/a
- [ ] https://example.com/b
```

Run:

```bash
npm run dev -- --output-dir ./outputs urls.md
```

After a URL is processed successfully, the matching checklist item is updated automatically:

```markdown
- [x] https://example.com/a
```

### Process RSS/Atom feeds

By default, `--source-kind auto` tries to detect whether the input is a normal HTML page or a feed. You can also specify the source kind explicitly:

```bash
npm run dev -- --source-kind rss-feed --since 2026-01-01 "https://example.com/feed.xml"
```

Useful slicing options:

```bash
npm run dev -- --start 1 --end 10 "https://example.com/feed.xml"
npm run dev -- --limit 5 "https://example.com/feed.xml"
```

## Fetch Modes

Use `--fetch-mode` to control how pages are fetched:

| Mode | Description |
| --- | --- |
| `auto` | Default. Try static fetch first, then fall back to browser/stealth when content is insufficient. |
| `static` | Use plain HTTP fetching only. Fastest option for static pages. |
| `browser` | Render the page in a browser. Useful for JavaScript-heavy sites. |
| `stealth` | Use a more realistic browser context. Useful for sites with stronger bot detection. |

Examples:

```bash
npm run dev -- --fetch-mode browser "https://example.com/article"
npm run dev -- --fetch-mode stealth --solve-cloudflare "https://example.com/article"
```

## Browser Options

Wait longer after page load:

```bash
npm run dev -- --fetch-mode browser --wait-ms 5000 "https://example.com/article"
```

Wait for a selector before extracting content:

```bash
npm run dev -- --fetch-mode browser --wait-selector "article" "https://example.com/article"
```

Click popups or expand buttons before extraction:

```bash
npm run dev -- --fetch-mode browser --click-selector "button.accept" --click-selector ".expand" "https://example.com/article"
```

Scroll to the bottom before extraction:

```bash
npm run dev -- --fetch-mode browser --scroll-to-bottom "https://example.com/article"
```

Use a proxy:

```bash
npm run dev -- --fetch-mode stealth --proxy "http://127.0.0.1:7890" "https://example.com/article"
```

Run with a visible browser window for debugging:

```bash
npm run dev -- --fetch-mode browser --headful "https://example.com/article"
```

## Use Local Chrome Login State

For pages that require an authenticated browser session, you can try using your local Chrome profile:

```bash
npm run dev -- \
  --prefer-browser-state \
  --chrome-user-data-dir "{CHROME_INSTALL_PATH}" \
  --chrome-profile "Default" \
  --fetch-mode browser \
  "https://example.com/member-only-article"
```

Only use this on your own device and accounts. Always respect the target site's terms of service and copyright rules.

## Common CLI Options

```text
--output-dir <dir>              Markdown output directory. Default: clippings
--source-kind <kind>            auto, html-page, or rss-feed. Default: auto
--since <date>                  Keep only feed entries on or after YYYY-MM-DD
--limit <n>                     Process only the first N deduplicated URLs
--start <n>                     Start from the Nth deduplicated URL, 1-based
--end <n>                       End at the Nth deduplicated URL, 1-based; 0 means no upper bound
--fetch-mode <mode>             auto, static, browser, or stealth. Default: auto
--wait-ms <ms>                  Extra browser wait after load. Default: 2500
--wait-selector <selector>      Wait for a CSS selector
--click-selector <selector...>  Click one or more selectors after page load
--scroll-to-bottom              Scroll to the bottom before extraction
--headful                       Run with a visible browser window
--proxy <server>                Proxy server for browser/stealth fetch
--solve-cloudflare              In stealth mode, try to handle Cloudflare challenges
--disable-resources             In stealth mode, block images/media/fonts/stylesheets for speed
--prefer-browser-state          Try local Chrome user state first
--chrome-user-data-dir <path>   Chrome User Data directory
--chrome-profile <name>         Chrome profile name. Default: Default
```

For the full option list, run:

```bash
npm run dev -- --help
```

## Development

```bash
npm install
npm run build
npm run typecheck
npm test
```

## Tips and Notes

- Respect robots.txt, website terms of service, copyright, and rate limits.
- For dynamic pages, try `--fetch-mode browser` first.
- For static blogs and news sites, `--fetch-mode static` is usually faster.
- If article extraction is poor for a specific site, add or adjust a site rule in `src/site-rules/`.
- For large batches, test with `--limit` before running the full job.

## Acknowledgements

Feedloom is inspired by several excellent open-source projects. Special thanks to:

- [Defuddle](https://github.com/kepano/defuddle), for high-quality readable content extraction ideas.
- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), for inspiring robust browser automation and realistic page access.
- [Scrapling](https://github.com/D4Vinci/Scrapling), for ideas around real browser contexts, anti-detection strategies, and resilient scraping fallbacks.

Thanks also to Linkedom, Turndown, Commander, Vitest, and the wider TypeScript ecosystem for the reliable building blocks.

## License

MIT License
