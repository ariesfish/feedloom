<div align="center">
  <img src="assets/logo.png" alt="Feedloom logo" width="160">
  <h1>Feedloom</h1>
  <p><strong>Archive long-form web content as clean Markdown with local assets.</strong></p>
  <p>
    <a href="https://www.npmjs.com/package/@ariesfish/feedloom"><img alt="npm version" src="https://img.shields.io/npm/v/@ariesfish/feedloom"></a>
    <img alt="Node 24 or newer" src="https://img.shields.io/badge/node-24%2B-339933">
    <img alt="MIT license" src="https://img.shields.io/badge/license-MIT-blue">
  </p>
</div>

Feedloom is a CLI for saving long-form web content as clean Markdown. It accepts article URLs, URL list files, and RSS/Atom feeds, extracts readable content, downloads page images, and writes portable Markdown notes with YAML frontmatter.

## Features

- Save articles as Markdown with local image assets.
- Read URLs directly, from text/Markdown files, or from RSS/Atom feeds.
- Deduplicate URL lists and mark completed Markdown checklist items.
- Use static, browser-rendered, or stealth fetching when pages need JavaScript rendering.
- Apply built-in site rules for common sites such as WeChat and Zhihu.
- Optionally use local Chrome login state for pages that require your own authenticated browser session.

## Requirements

- Node.js >= 24
- npm
- Patchright Chromium for browser-based fetching. `doctor` can install it automatically.

## Install or run

Run directly with `npx`:

```bash
npx -y @ariesfish/feedloom "https://example.com/article"
```

Or install globally:

```bash
npm install -g @ariesfish/feedloom
feedloom "https://example.com/article"
```

Check and repair the browser runtime:

```bash
npx -y @ariesfish/feedloom doctor
```

If the Patchright Chromium executable is missing, `doctor` runs `npx patchright install chromium` automatically.

## Quick start

Archive one article to `clippings/`:

```bash
npx -y @ariesfish/feedloom "https://example.com/article"
```

Write output somewhere else:

```bash
npx -y @ariesfish/feedloom --output-dir ./outputs "https://example.com/article"
```

Archive a URL list:

```bash
npx -y @ariesfish/feedloom urls.md --limit 10
```

Archive an RSS/Atom feed:

```bash
npx -y @ariesfish/feedloom "https://example.com/feed.xml" --source-kind rss-feed --since 2026-01-01
```

Use browser rendering for JavaScript-heavy pages:

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --fetch-mode browser --wait-ms 4000 --scroll-to-bottom
```

Use stealth mode only when normal static/browser fetching is insufficient:

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --fetch-mode stealth --solve-cloudflare
```

## Output

Generated notes are written to `clippings/` by default:

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

## Fetch modes

| Mode | Use when |
| --- | --- |
| `auto` | Default. Try static fetch first, then browser/stealth fallback when content is insufficient. |
| `static` | The page is server-rendered and does not require JavaScript. |
| `browser` | The page needs JavaScript rendering, waiting, clicking, or scrolling. |
| `stealth` | Browser mode fails because the site has stronger bot detection. |

## Agent Skill

Feedloom ships an Agent Skill in `skills/feedloom`, so agents that support the `skills` CLI can install the clipping workflow directly:

```bash
npx skills add @ariesfish/feedloom --skill feedloom
```

For a global install across supported agents:

```bash
npx skills add @ariesfish/feedloom --skill feedloom --global
```

After installing the skill, ask your agent to save article URLs, URL lists, or RSS feeds as Markdown. The skill runs the CLI through `npx -y @ariesfish/feedloom` by default.

## Site rules

Feedloom ships built-in TOML site rules for common dynamic or structured sites. You can also keep private rules outside the package and pass them at runtime:

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --site-rules-dir ./site-rules
```

## Acknowledgements

Feedloom is inspired by:

- [Defuddle](https://github.com/kepano/defuddle), for readable content extraction ideas.
- [Patchright](https://github.com/Kaliiiiiiiiii-Vinyzu/patchright), for browser automation and realistic page access.
- [Scrapling](https://github.com/D4Vinci/Scrapling), for resilient scraping fallback ideas.

## License

MIT License
