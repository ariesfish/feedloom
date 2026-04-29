import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { basename, join } from "node:path";

import type { FeedloomMetadata } from "./cleaning/types.js";

const FRONTMATTER_ESCAPE_RE = /[\n\r]/g;

export function sanitizeFilename(title: string): string {
  return title
    .replace(/[\\/:*?"<>|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 180) || "Untitled";
}

function yamlString(value: string): string {
  return JSON.stringify(value.replace(FRONTMATTER_ESCAPE_RE, " "));
}

export function renderFrontmatter(source: string, metadata: FeedloomMetadata, created: string): string {
  const lines = ["---", `source: ${yamlString(source)}`];
  if (metadata.author) {
    lines.push(`author: ${yamlString(metadata.author)}`);
  }
  lines.push(`created: ${yamlString(created)}`);
  lines.push("---", "");
  return `${lines.join("\n")}\n`;
}

function noteSource(text: string): string {
  const lines = text.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return "";
  for (const line of lines.slice(1)) {
    if (line.trim() === "---") break;
    const match = line.match(/^\s*source:\s*(.*)\s*$/);
    if (!match) continue;
    const raw = match[1].trim();
    try {
      return JSON.parse(raw) as string;
    } catch {
      return raw.replace(/^['"]|['"]$/g, "");
    }
  }
  return "";
}

export async function cleanupExistingNote(outputDir: string, sourceUrl: string): Promise<void> {
  await mkdir(outputDir, { recursive: true });
  const entries = await readdir(outputDir, { withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".md")) continue;
    const path = join(outputDir, entry.name);
    let text = "";
    try {
      text = await readFile(path, "utf8");
    } catch {
      continue;
    }
    if (noteSource(text) !== sourceUrl && !text.includes(`> Source: ${sourceUrl}`)) continue;
    await rm(path, { force: true });
    await rm(join(outputDir, "assets", basename(entry.name, ".md")), { recursive: true, force: true });
    return;
  }
}

function urlHash(url: string): string {
  return createHash("sha1").update(url).digest("hex").slice(0, 8);
}

export interface MarkdownNote {
  sourceUrl: string;
  title: string;
  metadata: FeedloomMetadata;
  markdown: string;
  created: string;
}

export async function writeMarkdownNote(outputDir: string, note: MarkdownNote): Promise<string> {
  await mkdir(outputDir, { recursive: true });
  const base = sanitizeFilename(note.title);
  let path = join(outputDir, `${base}.md`);
  try {
    // Keep first milestone deterministic and avoid accidental overwrites on title collisions.
    await stat(path);
    path = join(outputDir, `${base}-${urlHash(note.sourceUrl)}.md`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
  const body = note.markdown.trim();
  await writeFile(path, `${renderFrontmatter(note.sourceUrl, note.metadata, note.created)}# ${note.title}\n\n${body}\n`, "utf8");
  return path;
}
