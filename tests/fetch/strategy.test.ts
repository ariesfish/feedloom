import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { fetchHtml } from "../../src/fetch/strategy.js";

const URL = "https://example.com/article";

describe("fetchHtml", () => {
  it("returns static HTML when it is meaningful", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      staticFetch: async () => {
        calls.push("static");
        return "<main>article</main>";
      },
      browserFetch: async () => {
        calls.push("browser");
        return "<main>browser</main>";
      },
      isMeaningful: (_, candidate) => candidate.includes("article"),
    });

    expect(html).toContain("article");
    expect(calls).toEqual(["static"]);
  });

  it("honors browser-only fetch mode", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      fetchMode: "browser",
      staticFetch: async () => {
        calls.push("static");
        return "<main>static article</main>";
      },
      browserFetch: async () => {
        calls.push("browser");
        return "<article>browser article</article>";
      },
      isMeaningful: (_, candidate) => candidate.includes("article"),
    });

    expect(html).toContain("browser article");
    expect(calls).toEqual(["browser"]);
  });

  it("honors stealth-only fetch mode", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      fetchMode: "stealth",
      browserFetch: async () => {
        calls.push("browser");
        return "<article>browser article</article>";
      },
      stealthFetch: async () => {
        calls.push("stealth");
        return "<article>stealth article</article>";
      },
      isMeaningful: (_, candidate) => candidate.includes("article"),
    });

    expect(html).toContain("stealth article");
    expect(calls).toEqual(["stealth"]);
  });

  it("honors static-only fetch mode", async () => {
    const calls: string[] = [];
    await expect(
      fetchHtml(URL, {
        fetchMode: "static",
        staticFetch: async () => {
          calls.push("static");
          return "<main>shell</main>";
        },
        browserFetch: async () => {
          calls.push("browser");
          return "<article>browser article</article>";
        },
        isMeaningful: () => false,
      }),
    ).rejects.toThrow("static missing article content");
    expect(calls).toEqual(["static"]);
  });

  it("falls back to browser when static HTML is not meaningful", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      staticFetch: async () => {
        calls.push("static");
        return "<main>shell</main>";
      },
      browserFetch: async () => {
        calls.push("browser");
        return "<article>rendered article</article>";
      },
      isMeaningful: (_, candidate) => candidate.includes("rendered"),
    });

    expect(html).toContain("rendered article");
    expect(calls).toEqual(["static", "browser"]);
  });

  it("tries stealth after browser in auto mode", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      staticFetch: async () => {
        calls.push("static");
        return "<main>shell</main>";
      },
      browserFetch: async () => {
        calls.push("browser");
        return "<main>still shell</main>";
      },
      stealthFetch: async () => {
        calls.push("stealth");
        return "<article>stealth article</article>";
      },
      isMeaningful: (_, candidate) => candidate.includes("stealth article"),
    });

    expect(html).toContain("stealth article");
    expect(calls).toEqual(["static", "browser", "stealth"]);
  });

  it("tries browser-state before normal browser when configured", async () => {
    const calls: string[] = [];
    const html = await fetchHtml(URL, {
      browserState: { userDataDir: "/chrome", profile: "Default" },
      staticFetch: async () => {
        calls.push("static");
        return "<main>shell</main>";
      },
      browserStateFetch: async () => {
        calls.push("browser-state");
        return "<article>state article</article>";
      },
      browserFetch: async () => {
        calls.push("browser");
        return "<article>browser article</article>";
      },
      isMeaningful: (_, candidate) => candidate.includes("state article"),
    });

    expect(html).toContain("state article");
    expect(calls).toEqual(["static", "browser-state"]);
  });

  it("writes the latest successful HTML attempt to outputPath", async () => {
    const dir = await mkdtemp(join(tmpdir(), "feedloom-ts-strategy-test-"));
    const outputPath = join(dir, "page.html");
    try {
      const html = await fetchHtml(URL, {
        outputPath,
        staticFetch: async () => "<main>shell</main>",
        browserFetch: async () => "<article>rendered article</article>",
        isMeaningful: (_, candidate) => candidate.includes("rendered"),
      });

      expect(html).toContain("rendered article");
      await expect(readFile(outputPath, "utf8")).resolves.toContain("rendered article");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("aggregates attempt errors and missing-content failures", async () => {
    await expect(
      fetchHtml(URL, {
        staticFetch: async () => "<main>shell</main>",
        browserFetch: async () => {
          throw new Error("browser exploded");
        },
        stealthFetch: async () => {
          throw new Error("stealth exploded");
        },
        isMeaningful: () => false,
      }),
    ).rejects.toThrow("static missing article content; browser failed: browser exploded; stealth failed: stealth exploded");
  });
});
