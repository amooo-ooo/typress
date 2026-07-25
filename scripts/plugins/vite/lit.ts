import type { Plugin } from "vite";

export interface LitPluginOptions {
  /** Glob patterns for files to apply decorator transforms to. */
  include?: string[];
}

/**
 * Optional Vite plugin that enables Lit web component support.
 * Configures esbuild decorator handling so Lit's @customElement
 * and @property decorators work without modifying tsconfig.json.
 *
 * Usage in vite.config.ts:
 *   import { lit } from "./scripts/plugins/vite";
 *   plugins: [lit()]
 */
export function lit(_options: LitPluginOptions = {}): Plugin {
  return {
    name: "typress:lit",

    config() {
      return {
        esbuild: {
          tsconfigRaw: {
            compilerOptions: {
              experimentalDecorators: true,
              useDefineForClassFields: false,
            },
          },
        },
      };
    },
  };
}
