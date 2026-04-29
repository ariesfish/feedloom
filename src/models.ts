export interface UrlItem {
  url: string;
  inputUrl?: string;
  sourceKind: "html-page" | "rss-feed";
  discoveredFrom?: string;
  sourceTitle?: string;
  publishedAt?: Date;
  sourcePath?: string;
  lineNo?: number;
}

export function makeUrlItem(url: string, overrides: Partial<UrlItem> = {}): UrlItem {
  return {
    url,
    sourceKind: "html-page",
    ...overrides,
  };
}
