import { resolve } from "node:path";
import { readFile } from "node:fs/promises";
import { glob } from "glob";
import type { Plugin } from "vite";

export interface CopyTypOptions {
  /** Directory containing .typ source files. */
  pagesDir?: string;
}

/**
 * Copies raw .typ source files into the build output so they are
 * accessible at their original paths (e.g. /index.typ).
 */
export function copyTypFiles(options: CopyTypOptions = {}): Plugin {
  const pagesDir = options.pagesDir ?? resolve(process.cwd(), "src/pages");

  return {
    name: "typress:copy-typ",
    apply: "build",

    async generateBundle() {
      const files = await glob("**/*.typ", { cwd: pagesDir });

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
