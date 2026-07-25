import { resolve } from "node:path";
import { exec } from "node:child_process";
import { promisify } from "node:util";
import type { Plugin } from "vite";

const execAsync = promisify(exec);

export interface TypstHmrOptions {
  /** Command to run the SSG build script. */
  buildCommand?: string;
  /** Directory to watch for source changes. */
  watchDir?: string;
}

/**
 * Compiles Typst source files via the SSG script on build start,
 * and triggers a full page reload on .typ or layout changes during dev.
 */
export function typstHmr(options: TypstHmrOptions = {}): Plugin {
  const command = options.buildCommand ?? "bun scripts/ssg.ts";
  const watchDir = options.watchDir ?? resolve(process.cwd(), "src");
  const prefix = "\x1b[35mtypress\x1b[0m";

  async function runSSG(file?: string) {
    if (file) console.log(`${prefix} hmr update ${file}`);

    try {
      const { stdout, stderr } = await execAsync(command);
      if (stdout) console.log(stdout.trim());
      if (stderr) console.error(stderr.trim());
    } catch (e: unknown) {
      const err = e as { stdout?: string | Buffer; stderr?: string | Buffer };
      if (err?.stdout) console.log(err.stdout.toString().trim());
      if (err?.stderr) console.error(err.stderr.toString().trim());
    }
  }

  function isTypstSource(file: string): boolean {
    if (file.endsWith(".typ")) return true;
    if (!file.endsWith(".html")) return false;
    return file.includes("src/layouts") || file.includes("src\\layouts");
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
      // Ignore changes inside the intermediate .typress cache.
      if (file.includes(".typress")) return [];
      if (!isTypstSource(file)) return;

      await runSSG(file);
      server.ws.send({ type: "custom", event: "typress:hmr" });
      return [];
    },
  };
}
