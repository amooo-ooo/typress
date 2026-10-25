import { resolve } from "node:path";
import { readdirSync } from "node:fs";
import type { Plugin } from "vite";

/**
 * Configuration options for the `generateSitemap` Vite plugin.
 */
export interface SitemapOptions {
  /** Public base URL of the site without a trailing slash (e.g. `"https://example.com"`). */
  readonly siteUrl: string;
  /** Directory to discover compiled HTML pages from. Defaults to `.typress`. */
  readonly cacheDir?: string;
}

/**
 * Escapes XML special characters in URL strings.
 *
 * @param value Raw URL string.
 * @returns XML-safe escaped string.
 */
function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Normalises a relative HTML file path into a canonical route pathname.
 *
 * @param file Relative `.html` path within `.typress`.
 * @returns Canonical URL pathname beginning with `/`.
 */
function toCanonicalPath(file: string): string {
  const slug = file.replace(/\\/g, "/").replace(/\.html$/, "");
  if (slug === "index") return "/";
  if (slug.endsWith("/index")) {
    return `/${slug.slice(0, -5)}`;
  }
  return `/${slug}`;
}

/**
 * Generates a deterministic `sitemap.xml` from the compiled HTML pages in the build cache.
 *
 * @param options Sitemap configuration options.
 * @returns Configured Vite plugin instance.
 */
export function generateSitemap(options: SitemapOptions): Plugin {
  const cleanSiteUrl = options.siteUrl.replace(/\/+$/, "");
  const cacheDir = options.cacheDir ?? resolve(process.cwd(), ".typress");

  return {
    name: "typress:sitemap",
    apply: "build",

    generateBundle() {
      const entries = readdirSync(cacheDir, { recursive: true }) as string[];
      const pages = entries
        .filter(
          (file) =>
            file.endsWith(".html") &&
            !file.replace(/\\/g, "/").startsWith("_temp/"),
        )
        .sort();
      const today = new Date().toISOString().split("T")[0] ?? "";

      const urls = pages.map((file) => {
        const path = toCanonicalPath(file);
        const loc = escapeXml(`${cleanSiteUrl}${path}`);
        return [
          "  <url>",
          `    <loc>${loc}</loc>`,
          `    <lastmod>${today}</lastmod>`,
          "  </url>",
        ].join("\n");
      });

      const xml = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        ...urls,
        "</urlset>",
        "",
      ].join("\n");

      this.emitFile({ type: "asset", fileName: "sitemap.xml", source: xml });
    },
  };
}
