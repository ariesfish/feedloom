import { readFile } from "node:fs/promises";

import { parse } from "@iarna/toml";

import type { SiteProfile } from "./types.js";

interface FeedloomTomlRule {
  match?: {
    host_suffixes?: string[];
    host_regexes?: string[];
    url_regexes?: string[];
    html_markers?: string[];
  };
  extract?: {
    selectors?: string[];
  };
  metadata?: {
    fixed_author?: string;
    strip_title_regexes?: string[];
    author_selectors?: string[];
    author_meta_names?: string[];
    author_meta_itemprops?: string[];
    author_meta_properties?: string[];
  };
  clean?: {
    remove?: {
      selectors?: string[];
      class_contains?: string[];
      id_contains?: string[];
      attr_contains?: string[];
      text_contains?: string[];
      text_regexes?: string[];
      exact_text?: string[];
    };
    truncate?: {
      after_contains?: string[];
      after_regexes?: string[];
    };
  };
}

function partialAttributePatterns(rule: FeedloomTomlRule): string[] {
  return [
    ...(rule.clean?.remove?.class_contains ?? []),
    ...(rule.clean?.remove?.id_contains ?? []),
    ...(rule.clean?.remove?.attr_contains ?? []),
  ];
}

export function profileFromTomlRule(name: string, rule: FeedloomTomlRule): SiteProfile {
  return {
    name,
    match: {
      hostSuffixes: rule.match?.host_suffixes,
      hostRegexes: rule.match?.host_regexes,
      urlRegexes: rule.match?.url_regexes,
      htmlMarkers: rule.match?.html_markers,
    },
    content: {
      selectors: rule.extract?.selectors,
    },
    removals: {
      exactSelectors: rule.clean?.remove?.selectors,
      partialAttributePatterns: partialAttributePatterns(rule),
      textContains: rule.clean?.remove?.text_contains,
      textRegexes: rule.clean?.remove?.text_regexes,
      cutAfterContains: rule.clean?.truncate?.after_contains,
      cutAfterRegexes: rule.clean?.truncate?.after_regexes,
      dropExactText: rule.clean?.remove?.exact_text,
    },
    metadata: {
      fixedAuthor: rule.metadata?.fixed_author,
      titleSuffixPatterns: rule.metadata?.strip_title_regexes,
    },
  };
}

export async function loadSiteProfiles(paths: string[]): Promise<SiteProfile[]> {
  const profiles: SiteProfile[] = [];
  for (const path of paths) {
    const text = await readFile(path, "utf8");
    const raw = parse(text) as unknown as FeedloomTomlRule;
    const name = path.split(/[\\/]/).pop()?.replace(/\.toml$/i, "") || path;
    profiles.push(profileFromTomlRule(name, raw));
  }
  return profiles;
}

export function profileMatches(profile: SiteProfile, url: string | undefined, html: string): boolean {
  const match = profile.match;
  if (!match) {
    return true;
  }

  if (url) {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    if (match.hostSuffixes?.some((suffix) => host.endsWith(suffix.toLowerCase()))) {
      return true;
    }
    if (match.hostRegexes?.some((pattern) => new RegExp(pattern, "i").test(host))) {
      return true;
    }
    if (match.urlRegexes?.some((pattern) => new RegExp(pattern, "i").test(url))) {
      return true;
    }
  }

  if (match.htmlMarkers?.some((marker) => html.includes(marker))) {
    return true;
  }

  return !match.hostSuffixes?.length && !match.hostRegexes?.length && !match.urlRegexes?.length && !match.htmlMarkers?.length;
}

export function selectActiveProfiles(profiles: SiteProfile[] | undefined, url: string | undefined, html: string): SiteProfile[] {
  return profiles?.filter((profile) => profileMatches(profile, url, html)) ?? [];
}

export function firstContentSelector(profiles: SiteProfile[]): string | undefined {
  for (const profile of profiles) {
    const selector = profile.content?.selectors?.find((candidate) => candidate.trim());
    if (selector) {
      return selector;
    }
  }
  return undefined;
}
