import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { copyBrowserState } from "../../src/fetch/browser-state.js";

describe("copyBrowserState", () => {
  it("copies root state files and profile while ignoring locks and caches", async () => {
    const root = await mkdtemp(join(tmpdir(), "feedloom-ts-chrome-root-"));
    const dest = await mkdtemp(join(tmpdir(), "feedloom-ts-chrome-copy-"));
    try {
      await writeFile(join(root, "Local State"), "local-state", "utf8");
      await writeFile(join(root, "First Run"), "first-run", "utf8");
      await mkdir(join(root, "Default", "Nested"), { recursive: true });
      await mkdir(join(root, "Default", "GPUCache"), { recursive: true });
      await writeFile(join(root, "Default", "Cookies"), "cookies", "utf8");
      await writeFile(join(root, "Default", "Nested", "Preferences"), "prefs", "utf8");
      await writeFile(join(root, "Default", "SingletonLock"), "lock", "utf8");
      await writeFile(join(root, "Default", "debug.log"), "log", "utf8");
      await writeFile(join(root, "Default", "GPUCache", "blob"), "cache", "utf8");

      await copyBrowserState(root, dest, "Default");

      await expect(readFile(join(dest, "Local State"), "utf8")).resolves.toBe("local-state");
      await expect(readFile(join(dest, "First Run"), "utf8")).resolves.toBe("first-run");
      await expect(readFile(join(dest, "Default", "Cookies"), "utf8")).resolves.toBe("cookies");
      await expect(readFile(join(dest, "Default", "Nested", "Preferences"), "utf8")).resolves.toBe("prefs");
      await expect(readFile(join(dest, "Default", "SingletonLock"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(dest, "Default", "debug.log"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
      await expect(readFile(join(dest, "Default", "GPUCache", "blob"), "utf8")).rejects.toMatchObject({ code: "ENOENT" });
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });

  it("raises a clear error when the requested profile is missing", async () => {
    const root = await mkdtemp(join(tmpdir(), "feedloom-ts-chrome-root-"));
    const dest = await mkdtemp(join(tmpdir(), "feedloom-ts-chrome-copy-"));
    try {
      await expect(copyBrowserState(root, dest, "Default")).rejects.toThrow("Chrome profile not found");
    } finally {
      await rm(root, { recursive: true, force: true });
      await rm(dest, { recursive: true, force: true });
    }
  });
});
