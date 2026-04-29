# feedloom site rules

These TOML files are feedloom-specific site hints for the HTML cleaning pipeline.

Do not add TOML rules for sites already handled well by Defuddle's built-in extractors. Prefer Defuddle for procedural extractors such as Medium, Substack, GitHub, Hacker News, Reddit, YouTube, X/Twitter, Wikipedia, NYTimes, ChatGPT, Claude, Gemini, and similar conversation/social/video sites.

Add TOML only when feedloom needs an extra article-specific selector or cleanup overlay.

The schema is intentionally small and grouped by pipeline stage:

1. `[match]` decides whether a rule applies.
2. `[extract]` gives Defuddle content-container selector hints.
3. `[metadata]` normalizes extracted metadata strings.
4. `[clean.remove]` removes matching nodes/short text blocks.
5. `[clean.truncate]` removes a matched tail marker and everything after it.

## Schema

```toml
[match]
host_suffixes = ["example.com"]
host_regexes = []
url_regexes = []
html_markers = []

[extract]
selectors = ["article", "main"]

[metadata]
fixed_author = "Example"
strip_title_regexes = ["\\s*| Example\\s*$"]
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
