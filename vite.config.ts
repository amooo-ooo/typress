import { defineConfig } from "vite";
import { globSync } from "glob";
import { resolve } from "node:path";
import critical from "rollup-plugin-critical";
import { typressRouter } from "./scripts/plugins/vite-plugin-typress-router";
import { typstHmr } from "./scripts/plugins/vite-plugin-typst-hmr";
import { copyTypFiles } from "./scripts/plugins/vite-plugin-copy-typ";
import { generateSitemap } from "./scripts/plugins/vite-plugin-sitemap";

const CACHE_DIR = resolve(process.cwd(), ".typress");
const DIST_DIR = resolve(process.cwd(), "dist");
const SITE_URL = "https://typress-ssg-starter.pages.dev";

// Discover compiled HTML pages from the .typress build cache.
// The cache persists between runs, typstHmr's buildStart hook keeps it fresh.
const discoverPages = () =>
  globSync("**/*.html", { cwd: CACHE_DIR, ignore: ["_temp/**"] });

export default defineConfig(({ command }) => {
  const pages = command === "build" ? discoverPages() : [];

  return {
    root: ".typress",
    base: "./",
    publicDir: resolve(process.cwd(), "public"),

    plugins: [
      typressRouter(),
      typstHmr(),
      copyTypFiles(),
      generateSitemap({ siteUrl: SITE_URL }),
      critical({
        criticalUrl: `${DIST_DIR}/`,
        criticalBase: `${DIST_DIR}/`,
        criticalPages: pages.map((file) => ({
          uri: file,
          template: file.replace(/\.html$/, ""),
        })),
        criticalConfig: {
          inline: true,
          extract: false,
          dimensions: [
            { width: 375, height: 667 },
            { width: 1366, height: 768 },
          ],
        },
      }) as any,
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
        ignored: (p) => p.includes(".typress") && !p.includes("node_modules"),
      },
    },

    build: {
      outDir: "../dist",
      emptyOutDir: true,
      rollupOptions: {
        input: Object.fromEntries(
          pages.map((file) => [
            file.replace(/\.html$/, ""),
            resolve(CACHE_DIR, file),
          ]),
        ),
      },
    },
  };
});
