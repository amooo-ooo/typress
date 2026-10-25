import { defineConfig } from "vite";
import { readdirSync } from "node:fs";
import { resolve } from "node:path";
import { determineOutputPath } from "./scripts/ssg";
import {
  typressRouter,
  typstHmr,
  copyTypFiles,
  generateSitemap,
} from "./scripts/plugins/vite";

const PAGES_DIR = resolve(process.cwd(), "src/pages");
const CACHE_DIR = resolve(process.cwd(), ".typress");
const SITE_URL = "https://typress-ssg-starter.pages.dev";

/**
 * Discovers entry pages directly from `src/pages` so cold builds work before `.typress` exists.
 *
 * @returns Rollup input map of entry names to resolved `.typress` HTML paths.
 */
function discoverPageEntries(): Record<string, string> {
  const entries = readdirSync(PAGES_DIR, { recursive: true }) as string[];
  const typFiles = entries.filter((file) => file.endsWith(".typ")).sort();
  return Object.fromEntries(
    typFiles.map((file) => {
      const outHtml = determineOutputPath(file).replace(/\\/g, "/");
      const entryName = outHtml.replace(/\.html$/, "");
      return [entryName, resolve(CACHE_DIR, outHtml)];
    }),
  );
}

export default defineConfig(({ command }) => {
  const pageEntries = command === "build" ? discoverPageEntries() : {};

  return {
    root: ".typress",
    base: "./",
    publicDir: resolve(process.cwd(), "public"),

    plugins: [
      typressRouter(),
      typstHmr(),
      copyTypFiles(),
      generateSitemap({ siteUrl: SITE_URL }),
    ],

    resolve: {
      preserveSymlinks: true,
      alias: {
        "/src": resolve(process.cwd(), "src"),
        "/scripts": resolve(process.cwd(), "scripts"),
      },
    },

    server: {
      watch: {
        ignored: (p: string) =>
          p.includes(".typress") && !p.includes("node_modules"),
      },
    },

    build: {
      outDir: "../dist",
      emptyOutDir: true,
      modulePreload: {
        polyfill: false,
      },
      rollupOptions: {
        input: pageEntries,
      },
    },
  };
});
