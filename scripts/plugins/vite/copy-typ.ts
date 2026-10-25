import { resolve } from "node:path";
import { readdir, readFile } from "node:fs/promises";
import type { Plugin } from "vite";

/**
 * Configuration options for the `copyTypFiles` Vite plugin.
 */
export interface CopyTypOptions {
  /** Directory containing `.typ` source files. Defaults to `src/pages`. */
  readonly pagesDir?: string;
}

/**
 * Copies raw `.typ` source files into the production build output so they remain accessible at their route paths.
 *
 * @param options Optional plugin configuration.
 * @returns Configured Vite plugin instance.
 */
export function copyTypFiles(options: CopyTypOptions = {}): Plugin {
  const pagesDir = options.pagesDir ?? resolve(process.cwd(), "src/pages");

  return {
    name: "typress:copy-typ",
    apply: "build",

    async generateBundle() {
      const entries = await readdir(pagesDir, { recursive: true });
      const files = entries.filter((file) => file.endsWith(".typ")).sort();

      await Promise.all(
        files.map(async (file) => {
          const source = await readFile(resolve(pagesDir, file));
          this.emitFile({
            type: "asset",
            fileName: file.replace(/\\/g, "/"),
            source,
          });
        }),
      );
    },
  };
}
