import type { Plugin } from "vite";

/**
 * Configuration options for the Lit Vite plugin.
 */
export interface LitPluginOptions {
  /** Optional glob patterns for files to apply decorator transforms to. */
  readonly include?: string[];
}

/**
 * Configures esbuild decorator transforms for Lit web components.
 *
 * @param options Optional plugin configuration.
 * @returns Configured Vite plugin instance.
 */
export function lit(options: LitPluginOptions = {}): Plugin {
  return {
    name: "typress:lit",

    config() {
      return {
        esbuild: {
          ...(options.include ? { include: options.include } : {}),
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
