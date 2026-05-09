# Feedloom site rules

Use TOML site rules when Feedloom needs a narrow site-specific selector, cleanup overlay, metadata normalization, or conservative fetch preference. Do not write ad-hoc scrapers.

## Locations

Private skill rules live in:

```text
$HOME/.agents/skills/feedloom/site-rules/<site>.toml
```

When the private rules directory exists, pass it on every command:

```bash
npx -y @ariesfish/feedloom "https://example.com/article" --site-rules-dir $HOME/.agents/skills/feedloom/site-rules
```

## Add a private rule

Create or edit one TOML file per site:

```bash
mkdir -p $HOME/.agents/skills/feedloom/site-rules
$EDITOR $HOME/.agents/skills/feedloom/site-rules/example.toml
```

Minimal rule:

```toml
[match]
host_suffixes = ["example.com"]

[extract]
selectors = ["article", "main"]
```

Rule with fetch preferences:

```toml
[match]
host_suffixes = ["zhihu.com"]

[fetch]
mode = "browser"
prefer_browser_state = true
scroll_to_bottom = true
wait_ms = 8000

[extract]
selectors = ["[class*=\"Post-RichTextContainer\"]", "[class*=\"RichText ztext\"]"]
```

## Schema

Supported sections:

- `[match]`: `host_suffixes`, `host_regexes`, `url_regexes`, `html_markers`.
- `[fetch]`: `mode`, `prefer_browser_state`, `wait_ms`, `network_idle`, `wait_selector`, `wait_selector_state`, `click_selectors`, `scroll_to_bottom`, `use_proxy_env`.
- `[extract]`: `selectors`, `require_text`.
- `[metadata]`: `fixed_author`, `strip_title_regexes`, `strip_author_regexes`, `author_selectors`, `author_meta_names`, `author_meta_itemprops`, `author_meta_properties`.
- `[clean.remove]`: `selectors`, `class_contains`, `id_contains`, `attr_contains`, `text_contains`, `text_regexes`, `exact_text`.
- `[clean.truncate]`: `after_contains`, `after_regexes`.

## Fetch rules

Use `[fetch]` only when a site consistently needs browser rendering, local Chrome state, scrolling, waiting, clicking, or proxy-aware requests.

`use_proxy_env = true` tells Feedloom to use `HTTP_PROXY`, `HTTPS_PROXY`, `ALL_PROXY`, and `NO_PROXY` for static fetches and Defuddle async extractor fetches. Use this for YouTube transcript capture and similar extractor-backed pages that need the user's proxy settings.

`prefer_browser_state = true` only tells Feedloom to use copied Chrome state for matching URLs. It does not store the local Chrome path. The command still needs Chrome state parameters when login state is required:

```bash
npx -y @ariesfish/feedloom \
  --chrome-user-data-dir "$HOME/Library/Application Support/Google/Chrome" \
  --chrome-profile Default \
  --site-rules-dir $HOME/.agents/skills/feedloom/site-rules \
  "https://zhuanlan.zhihu.com/p/..."
```

## Rules for writing rules

- Prefer narrow domain-specific selectors over broad selectors.
- Prefer content containers over page shells. Avoid `body` unless the HTML is already minimal.
- Use `require_text = true` when a matched extractor-backed page should fail instead of writing an empty note.
- Use cleanup only for repeated, stable noise inside otherwise correct content.
- Use truncation only for stable tail markers where everything after the marker is non-article content.
- Do not add aggressive crawling, high concurrency, repeated challenge solving, or broad stealth defaults.
- Keep private rules outside project repos unless the user is working on Feedloom itself.

## Validation

After adding or editing a private rule, test one known URL and inspect the Markdown:

```bash
outdir=$(mktemp -d /tmp/feedloom-rule-test-XXXXXX)
npx -y @ariesfish/feedloom \
  --output-dir "$outdir" \
  --site-rules-dir $HOME/.agents/skills/feedloom/site-rules \
  "https://example.com/article"
find "$outdir" -maxdepth 2 -type f | sort
```

For sites that require Chrome state, add the Chrome state options shown above.
