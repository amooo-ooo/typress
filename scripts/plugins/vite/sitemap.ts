import { resolve } from "node:path";
import { globSync } from "glob";
import type { Plugin } from "vite";

export interface SitemapOptions {
  /** Public base URL of the site (no trailing slash). */
  siteUrl: string;
  /** Directory to glob HTML pages from. */
  cacheDir?: string;
}

/**
 * Generates a sitemap.xml from the compiled HTML pages in the build cache.
 * Runs at bundle time so newly compiled pages are always included.
 */
export function generateSitemap(options: SitemapOptions): Plugin {
  const { siteUrl } = options;
  const cacheDir = options.cacheDir ?? resolve(process.cwd(), ".typress");

  return {
    name: "typress:sitemap",
    apply: "build",

    generateBundle() {
      const pages = globSync("**/*.html", {
        cwd: cacheDir,
        ignore: ["_temp/**"],
      });
      const today = new Date().toISOString().split("T")[0];

      const urls = pages.map((file) => {
        const slug = file.replace(/\\/g, "/").replace(/\.html$/, "");
        const path = slug === "index" ? "/" : `/${slug}`;
        return [
          "  <url>",
          `    <loc>${siteUrl}${path}</loc>`,
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
