export interface FeedloomMetadata {
  title?: string;
  description?: string;
  domain?: string;
  favicon?: string;
  image?: string;
  language?: string;
  published?: string;
  author?: string;
  site?: string;
  schemaOrgData?: unknown;
  wordCount?: number;
  parseTime?: number;
}

export interface MatchProfileRules {
  hostSuffixes?: string[];
  hostRegexes?: string[];
  urlRegexes?: string[];
  htmlMarkers?: string[];
}

export interface ContentProfileRules {
  selectors?: string[];
}

export interface RemovalProfileRules {
  exactSelectors?: string[];
  partialAttributePatterns?: string[];
  textContains?: string[];
  textRegexes?: string[];
  cutAfterContains?: string[];
  cutAfterRegexes?: string[];
  dropExactText?: string[];
  dropTextRegexes?: string[];
}

export interface MetadataProfileRules {
  fixedAuthor?: string;
  titleSuffixPatterns?: string[];
}

export interface SiteProfile {
  name: string;
  match?: MatchProfileRules;
  content?: ContentProfileRules;
  removals?: RemovalProfileRules;
  metadata?: MetadataProfileRules;
}

export interface HtmlCleaningOptions {
  baseUrl?: string;
  debug?: boolean;
  markdown?: boolean;
  removeSmallImages?: boolean;
  removeHiddenElements?: boolean;
  removeLowScoring?: boolean;
  removeExactSelectors?: boolean;
  removePartialSelectors?: boolean;
  removeContentPatterns?: boolean;
  standardize?: boolean;
  contentSelector?: string;
  profiles?: SiteProfile[];
  activeProfiles?: SiteProfile[];
}

export interface RemovalRecord {
  step: string;
  selector?: string;
  reason?: string;
  text: string;
}

export interface HtmlCleaningDebug {
  contentSelector?: string;
  activeProfiles: string[];
  removals: RemovalRecord[];
}

export interface HtmlCleaningResult {
  content: string;
  contentMarkdown?: string;
  metadata: FeedloomMetadata;
  debug?: HtmlCleaningDebug;
}
