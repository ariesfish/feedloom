import { mkdir, writeFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { parseHTML } from "linkedom";

function extensionFrom(contentType: string | null, url: string): string {
  const pathExt = extname(new URL(url).pathname).replace(/[^.a-z0-9]/gi, "");
  if (pathExt && pathExt.length <= 8) return pathExt;
  if (contentType?.includes("svg")) return ".svg";
  if (contentType?.includes("png")) return ".png";
  if (contentType?.includes("webp")) return ".webp";
  if (contentType?.includes("gif")) return ".gif";
  return ".jpg";
}

function svgImageAlt(svg: Element): string {
  return svg.getAttribute("aria-label")?.trim()
    || svg.getAttribute("alt")?.trim()
    || svg.querySelector("title")?.textContent?.trim()
    || "formula";
}

function ensureSvgNamespace(svg: Element): string {
  const html = svg.outerHTML;
  return /\sxmlns=/.test(html) ? html : html.replace(/^<svg\b/i, '<svg xmlns="http://www.w3.org/2000/svg"');
}

export interface LocalizeImagesOptions {
  outputDir: string;
  noteSlug: string;
  baseUrl: string;
  fetchImage?: typeof fetch;
}

function imageSource(img: Element): string | null {
  const direct = img.getAttribute("data-original") || img.getAttribute("data-src") || img.getAttribute("src");
  if (direct) return direct;
  const srcset = img.getAttribute("data-srcset") || img.getAttribute("srcset");
  const first = srcset?.split(",").map((part) => part.trim().split(/\s+/)[0]).find(Boolean);
  return first || null;
}

export async function localizeImages(html: string, options: LocalizeImagesOptions): Promise<string> {
  const { document } = parseHTML(`<!doctype html><html><body>${html}</body></html>`);
  const images = Array.from(document.querySelectorAll("img"));
  const inlineSvgs = Array.from(document.querySelectorAll("svg"));
  if (images.length === 0 && inlineSvgs.length === 0) return html;

  const fetchImage = options.fetchImage ?? fetch;
  const seen = new Map<string, string>();
  let index = 1;
  const assetDir = join(options.outputDir, "assets", options.noteSlug);

  for (const svg of inlineSvgs) {
    const filename = `image-${String(index).padStart(3, "0")}.svg`;
    index += 1;
    try {
      await mkdir(assetDir, { recursive: true });
      await writeFile(join(assetDir, filename), ensureSvgNamespace(svg), "utf8");
    } catch {
      continue;
    }
    const img = document.createElement("img");
    img.setAttribute("src", `assets/${encodeURIComponent(options.noteSlug)}/${filename}`);
    img.setAttribute("alt", svgImageAlt(svg));
    const mathContainer = svg.parentElement?.tagName.toLowerCase() === "mjx-container" ? svg.parentElement : null;
    if (mathContainer) {
      mathContainer.replaceWith(img);
    } else {
      svg.replaceWith(img);
    }
  }

  for (const img of images) {
    const raw = imageSource(img);
    if (!raw || raw.startsWith("data:") || raw.startsWith("blob:")) continue;
    let absolute: string;
    try {
      absolute = new URL(raw, options.baseUrl).toString();
    } catch {
      continue;
    }
    let rel = seen.get(absolute);
    if (!rel) {
      let response: Response;
      try {
        response = await fetchImage(absolute);
      } catch {
        continue;
      }
      if (!response.ok) continue;
      const contentType = response.headers.get("content-type");
      if (contentType && !contentType.toLowerCase().startsWith("image/")) continue;
      const ext = extensionFrom(contentType, absolute);
      const filename = `image-${String(index).padStart(3, "0")}${ext}`;
      index += 1;
      try {
        await mkdir(assetDir, { recursive: true });
        await writeFile(join(assetDir, filename), new Uint8Array(await response.arrayBuffer()));
      } catch {
        continue;
      }
      rel = `assets/${encodeURIComponent(options.noteSlug)}/${filename}`;
      seen.set(absolute, rel);
    }
    img.setAttribute("src", rel);
    const alt = img.getAttribute("alt")?.trim().toLowerCase();
    if (alt === "image" || alt === "图像" || alt === "图片") {
      img.setAttribute("alt", "");
    }
    img.removeAttribute("srcset");
    img.removeAttribute("data-srcset");
    img.removeAttribute("data-original");
    img.removeAttribute("data-src");
  }

  return document.body.innerHTML;
}
