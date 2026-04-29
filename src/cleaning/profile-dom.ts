import type { SiteProfile, RemovalRecord } from "./types.js";

function textPreview(element: Element): string {
  return (element.textContent ?? "").replace(/\s+/g, " ").trim().slice(0, 160);
}

function recordRemoval(removals: RemovalRecord[], step: string, reason: string, element: Element, selector?: string): void {
  removals.push({ step, reason, selector, text: textPreview(element) });
}

function removeElement(removals: RemovalRecord[], step: string, reason: string, element: Element, selector?: string): void {
  recordRemoval(removals, step, reason, element, selector);
  element.remove();
}

function removeByExactSelectors(root: Element, profiles: SiteProfile[], removals: RemovalRecord[]): void {
  for (const profile of profiles) {
    for (const selector of profile.removals?.exactSelectors ?? []) {
      root.querySelectorAll(selector).forEach((element) => {
        removeElement(removals, "site-profile:exact-selector", profile.name, element, selector);
      });
    }
  }
}

function removeByPartialAttributePatterns(root: Element, profiles: SiteProfile[], removals: RemovalRecord[]): void {
  const patterns = profiles.flatMap((profile) =>
    (profile.removals?.partialAttributePatterns ?? []).map((pattern) => ({ profile: profile.name, regex: new RegExp(pattern, "i") })),
  );
  if (patterns.length === 0) {
    return;
  }

  root.querySelectorAll("*").forEach((element) => {
    if (element.closest("pre, code, table, figure")) {
      return;
    }
    const attrs = [
      element.id,
      element.getAttribute("class") ?? "",
      element.getAttribute("data-component") ?? "",
      element.getAttribute("data-test") ?? "",
      element.getAttribute("data-testid") ?? "",
      element.getAttribute("data-qa") ?? "",
      element.getAttribute("data-cy") ?? "",
    ].join(" ");
    const matched = patterns.find((pattern) => pattern.regex.test(attrs));
    if (matched) {
      removeElement(removals, "site-profile:partial-attribute", matched.profile, element);
    }
  });
}

function removeTrailingSiblings(element: Element, removals: RemovalRecord[], reason: string): void {
  let sibling = element.nextElementSibling;
  while (sibling) {
    const next = sibling.nextElementSibling;
    removeElement(removals, "site-profile:content-pattern", reason, sibling);
    sibling = next;
  }
}

function truncationCutPoint(root: Element, element: Element): Element {
  let current = element;
  let best = element;
  while (current.parentElement && current.parentElement !== root) {
    if (current.previousElementSibling) {
      best = current;
    }
    current = current.parentElement;
  }
  return current.previousElementSibling ? current : best;
}

function truncateFromElement(root: Element, element: Element, removals: RemovalRecord[], reason: string): void {
  const cutPoint = truncationCutPoint(root, element);
  removeTrailingSiblings(cutPoint, removals, reason);
  removeElement(removals, "site-profile:content-pattern", reason, cutPoint);
}

function compileProfileRegexes(profiles: SiteProfile[], key: "textRegexes" | "dropTextRegexes" | "cutAfterRegexes") {
  return profiles.flatMap((profile) =>
    (profile.removals?.[key] ?? []).map((pattern) => ({ profile: profile.name, regex: new RegExp(pattern, "i") })),
  );
}

function removeByTextPatterns(root: Element, profiles: SiteProfile[], removals: RemovalRecord[]): void {
  const textContains = profiles.flatMap((profile) =>
    (profile.removals?.textContains ?? []).map((marker) => ({ profile: profile.name, marker })),
  );
  const cutContains = profiles.flatMap((profile) =>
    (profile.removals?.cutAfterContains ?? []).map((marker) => ({ profile: profile.name, marker })),
  );
  const dropExact = new Map<string, string>();
  for (const profile of profiles) {
    for (const value of profile.removals?.dropExactText ?? []) {
      dropExact.set(value.trim(), profile.name);
    }
  }
  const textRegexes = compileProfileRegexes(profiles, "textRegexes");
  const dropRegexes = compileProfileRegexes(profiles, "dropTextRegexes");
  const cutRegexes = compileProfileRegexes(profiles, "cutAfterRegexes");

  root.querySelectorAll("p, div, section, aside, footer, header, li, h1, h2, h3, h4, h5, h6").forEach((element) => {
    if (element.closest("pre, code, table, figure")) {
      return;
    }
    const text = (element.textContent ?? "").replace(/\s+/g, " ").trim();
    if (!text) {
      return;
    }

    const cut = text.length <= 240
      ? cutContains.find((entry) => text.includes(entry.marker)) ?? cutRegexes.find((entry) => entry.regex.test(text))
      : undefined;
    if (cut) {
      truncateFromElement(root, element, removals, cut.profile);
      return;
    }

    const exactProfile = dropExact.get(text);
    const matchedContains = textContains.find(
      (entry) => text === entry.marker || (text.length <= Math.max(entry.marker.length * 3, 120) && text.includes(entry.marker)),
    );
    const matched =
      (exactProfile ? { profile: exactProfile } : undefined) ??
      matchedContains ??
      textRegexes.find((entry) => entry.regex.test(text)) ??
      dropRegexes.find((entry) => entry.regex.test(text));
    if (matched) {
      removeElement(removals, "site-profile:content-pattern", matched.profile, element);
    }
  });
}

function applyFixedAuthor(metadata: { author?: string }, profiles: SiteProfile[]): void {
  for (const profile of profiles) {
    if (profile.metadata?.fixedAuthor) {
      metadata.author = profile.metadata.fixedAuthor;
    }
  }
}

function cleanupTitle(metadata: { title?: string }, profiles: SiteProfile[]): void {
  if (!metadata.title) {
    return;
  }
  let title = metadata.title;
  for (const profile of profiles) {
    for (const pattern of profile.metadata?.titleSuffixPatterns ?? []) {
      title = title.replace(new RegExp(pattern, "i"), "").trim();
    }
  }
  metadata.title = title;
}

export function applySiteProfiles(root: Element, profiles: SiteProfile[], removals: RemovalRecord[]): void {
  removeByExactSelectors(root, profiles, removals);
  removeByPartialAttributePatterns(root, profiles, removals);
  removeByTextPatterns(root, profiles, removals);
}

export function applyMetadataProfiles(metadata: { title?: string; author?: string }, profiles: SiteProfile[]): void {
  applyFixedAuthor(metadata, profiles);
  cleanupTitle(metadata, profiles);
}
