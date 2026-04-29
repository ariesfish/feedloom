export interface StaticFetchResult {
  url: string;
  html: string;
  contentType: string;
}

export async function fetchStaticHtml(url: string, timeoutMs = 60_000): Promise<StaticFetchResult> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      redirect: "follow",
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status} ${response.statusText}`);
    }
    return {
      url: response.url || url,
      html: await response.text(),
      contentType: response.headers.get("content-type") ?? "",
    };
  } finally {
    clearTimeout(timeout);
  }
}
