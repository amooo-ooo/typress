import { resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Plugin } from "vite";
import { buildSSG } from "../../ssg";

const execAsync = promisify(exec);

/** Regular expression matching structured data files referenced by Typst documents. */
const DATA_FILE_REGEX = /\.(?:json|bib|csv|toml|ya?ml|xml)$/i;

/**
 * Configuration options for the `typstHmr` Vite plugin.
 */
export interface TypstHmrOptions {
  /** Optional custom shell command to execute the SSG build script. */
  readonly buildCommand?: string;
  /** Directory to watch for source changes. Defaults to `src`. */
  readonly watchDir?: string;
}

/**
 * Compiles Typst source files on build start and serialises HMR rebuilds on source changes.
 *
 * @param options Optional HMR plugin configuration.
 * @returns Configured Vite plugin instance.
 */
export function typstHmr(options: TypstHmrOptions = {}): Plugin {
  const customCommand = options.buildCommand;
  const watchDir = options.watchDir ?? resolve(process.cwd(), "src");
  const prefix = "\x1b[35mtypress\x1b[0m";

  let activeBuild: Promise<void> | null = null;
  let pendingRebuild = false;
  let pendingTargetFile: string | undefined;

  async function executeBuild(targetFile?: string): Promise<void> {
    if (!customCommand) {
      await buildSSG(targetFile);
      return;
    }

    try {
      const { stdout, stderr } = await execAsync(customCommand);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
    } catch (e: unknown) {
      const err = e as { stdout?: string | Buffer; stderr?: string | Buffer };
      if (err?.stdout) console.log(err.stdout.toString().trim());
      if (err?.stderr) console.error(err.stderr.toString().trim());
    }
  }

  // Coalesce concurrent HMR triggers so multiple rapid file saves never race on the filesystem.
  async function runSSG(file?: string): Promise<void> {
    if (file) console.log(`${prefix} hmr update ${file}`);

    if (activeBuild) {
      pendingRebuild = true;
      pendingTargetFile =
        pendingTargetFile === file ? file : undefined;
      await activeBuild;
      return;
    }

    pendingTargetFile = file;
    activeBuild = (async () => {
      do {
        const target = pendingTargetFile;
        pendingRebuild = false;
        pendingTargetFile = undefined;
        await executeBuild(target);
      } while (pendingRebuild);
    })();

    try {
      await activeBuild;
    } finally {
      activeBuild = null;
    }
  }

  function isTypstSource(file: string): boolean {
    const normalised = file.replace(/\\/g, "/");
    if (normalised.endsWith(".typ")) return true;
    if (normalised.endsWith(".html") && normalised.includes("src/layouts/")) {
      return true;
    }
    if (
      DATA_FILE_REGEX.test(normalised) &&
      (normalised.includes("src/assets/") || normalised.includes("src/data/"))
    ) {
      return true;
    }
    return false;
  }

  return {
    name: "typress:hmr",
    enforce: "pre",

    configureServer(server) {
      server.watcher.add([watchDir.replace(/\\/g, "/")]);
    },

    async buildStart() {
      await runSSG();
    },

    async handleHotUpdate({ file, server }) {
      if (file.includes(".typress")) return [];
      if (!isTypstSource(file)) return [];

      await runSSG(file);
      server.ws.send({ type: "custom", event: "typress:hmr" });
      return [];
    },
  };
}
