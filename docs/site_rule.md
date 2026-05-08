# feedloom site rules

Site rules are feedloom-specific TOML hints for extraction, cleanup, metadata normalization, and fetch behavior.

Do not add TOML rules for sites already handled well by Defuddle's built-in extractors. Prefer Defuddle for procedural extractors such as Medium, Substack, GitHub, Hacker News, Reddit, YouTube, X/Twitter, Wikipedia, NYTimes, ChatGPT, Claude, Gemini, and similar conversation/social/video sites.

Add TOML only when feedloom needs an extra article-specific selector, cleanup overlay, metadata normalization, or conservative site-specific fetch preference.

## Locations

Built-in rules live in:

```text
src/site-rules/*.toml
```

They are copied into the package build by `npm run build`:

```text
dist/site-rules/*.toml
```

Private/local rules can live outside the package and are loaded with:

```bash
feedloom --site-rules-dir /path/to/site-rules "https://example.com/article"
```

Load order is:

1. built-in `src/site-rules/*.toml` / `dist/site-rules/*.toml`
2. user-provided `--site-rules-dir <dir>` rules

Later rules are appended, not used as replacements. Keep private rules narrow so they do not affect unrelated pages.

## Pipeline stages

The schema is intentionally small and grouped by pipeline stage:

1. `[match]` decides whether a rule applies.
2. `[fetch]` sets site-specific fetch preferences before HTML is fetched.
3. `[extract]` gives Defuddle content-container selector hints.
4. `[metadata]` normalizes extracted metadata strings.
5. `[clean.remove]` removes matching nodes/short text blocks.
6. `[clean.truncate]` removes a matched tail marker and everything after it.

## Schema

```toml
[match]
host_suffixes = ["example.com"]
host_regexes = []
url_regexes = []
html_markers = []

[fetch]
mode = "browser"
prefer_browser_state = true
wait_ms = 8000
network_idle = true
wait_selector = "article"
wait_selector_state = "attached"
click_selectors = []
scroll_to_bottom = true

[extract]
selectors = ["article", "main"]

[metadata]
fixed_author = "Example"
strip_title_regexes = ["\\s*| Example\\s*$"]
strip_author_regexes = ["关注$"]
author_selectors = []
author_meta_names = ["author"]
author_meta_itemprops = ["author"]
author_meta_properties = ["article:author"]

[clean.remove]
selectors = [".share"]
class_contains = ["related"]
id_contains = []
attr_contains = []
text_contains = []
text_regexes = []
exact_text = []

[clean.truncate]
after_contains = []
after_regexes = []
```

All fields are optional. Omit empty sections unless they document intent.

## `[match]`

Use the narrowest stable matcher available.

```toml
[match]
host_suffixes = ["mp.weixin.qq.com"]
```

Supported fields:

- `host_suffixes`: hostname suffix match, case-insensitive.
- `host_regexes`: regex match against hostname.
- `url_regexes`: regex match against the full URL.
- `html_markers`: string markers in the fetched HTML.

Rules with no match fields apply globally. Avoid global rules except for explicit tests.

## `[fetch]`

Use `[fetch]` only for site behavior that is consistently required, such as a site that blocks static fetch or requires logged-in browser state for public article rendering.

Supported fields:

- `mode`: `auto`, `static`, `browser`, or `stealth`.
- `prefer_browser_state`: when `true`, use copied Chrome state for matched URLs if the user configured `--chrome-user-data-dir` and `--chrome-profile`.
- `wait_ms`: extra browser wait after load.
- `network_idle`: whether to wait for browser network idle.
- `wait_selector`: CSS selector to wait for.
- `wait_selector_state`: `attached`, `detached`, `visible`, or `hidden`.
- `click_selectors`: selectors to click after load.
- `scroll_to_bottom`: scroll before reading HTML.

Example for Zhihu-like pages:

```toml
[fetch]
mode = "browser"
prefer_browser_state = true
scroll_to_bottom = true
wait_ms = 8000
```

`prefer_browser_state` does not store local Chrome paths in TOML. The user still supplies those at runtime:

```bash
feedloom \
  --chrome-user-data-dir "$HOME/Library/Application Support/Google/Chrome" \
  --chrome-profile Default \
  "https://zhuanlan.zhihu.com/p/..."
```

Do not add aggressive defaults such as high concurrency, repeated challenge solving, or broad stealth behavior. Site rules should improve normal article access, not bypass authentication boundaries.

## `[extract]`

Use selectors for the smallest stable article container.

```toml
[extract]
selectors = ["#js_content"]
```

Prefer content containers over page shells. Avoid broad selectors like `body` unless the site HTML is already minimal.

## `[metadata]`

Use metadata rules for deterministic cleanup and fallback author extraction.

```toml
[metadata]
strip_title_regexes = ["\\s*-\\s*知乎\\s*$"]
author_selectors = [".byline .name"]
```

Supported fields:

- `fixed_author`
- `strip_title_regexes`
- `author_selectors`
- `strip_author_regexes`
- `author_meta_names`
- `author_meta_itemprops`
- `author_meta_properties`

## `[clean.remove]`

Use removal rules for repeated noise inside otherwise correct content.

```toml
[clean.remove]
class_contains = ["RichText-LinkCardContainer"]
exact_text = ["目录", "收起"]
text_regexes = ["^目录收起$"]
```

Supported fields:

- `selectors`: exact CSS selectors.
- `class_contains`: regex fragments matched against class attributes.
- `id_contains`: regex fragments matched against ids.
- `attr_contains`: regex fragments matched against common data attributes.
- `text_contains`: short text markers.
- `text_regexes`: regexes matched against short text blocks.
- `exact_text`: exact text blocks to drop.

Removal ignores content inside `pre`, `code`, `table`, and `figure` where practical.

## `[clean.truncate]`

Use truncation for stable tail markers where everything after the marker is non-article content.

```toml
[clean.truncate]
after_regexes = ["^发布于 ", "^赞同 ", "^\\d+ 条评论$"]
```

Supported fields:

- `after_contains`
- `after_regexes`

Keep truncation markers narrow. A broad marker can delete real article content.

## Built-in examples

WeChat official account articles:

```toml
[match]
host_suffixes = ["mp.weixin.qq.com"]

[extract]
selectors = ["#js_content"]
```

Zhihu articles:

```toml
[match]
host_suffixes = ["zhihu.com"]

[extract]
selectors = ["[class*=\"Post-RichTextContainer\"]", "[class*=\"RichText ztext\"]", "[class*=\"RichContent-inner\"]"]

[fetch]
mode = "browser"
prefer_browser_state = true
scroll_to_bottom = true
wait_ms = 8000
```

## Validation

For rule changes, run at least:

```bash
npm run typecheck
npx vitest run tests/cleaning/builtin-site-rules.test.ts tests/pipeline.test.ts
npm test
npm run build
```

For live-site checks, use one or two known URLs only and keep output in a temporary directory:

```bash
outdir=$(mktemp -d /tmp/feedloom-rule-test-XXXXXX)
npm run dev -- --output-dir "$outdir" "https://example.com/article"
```

For sites that require Chrome state, pass the local state source explicitly:

```bash
npm run dev -- \
  --output-dir "$outdir" \
  --chrome-user-data-dir "$HOME/Library/Application Support/Google/Chrome" \
  --chrome-profile Default \
  "https://zhuanlan.zhihu.com/p/..."
```
