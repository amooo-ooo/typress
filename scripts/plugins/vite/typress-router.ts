import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import type { Plugin } from "vite";

/**
 * Dev-server middleware for the Typress SSG.
 *
 * - Serves raw .typ files with correct headers and path-traversal protection.
 * - Rewrites extensionless HTML requests so Vite can resolve them
 *   (e.g. /cheatsheet -> /cheatsheet.html).
 */
export function typressRouter(): Plugin {
  return {
    name: "typress:router",

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = req.url;
        if (!url) return next();

        const cleanUrl = url.split("?")[0]!;

        // Serve raw .typ source files.
        if (cleanUrl.endsWith(".typ")) {
          if (cleanUrl.includes("..")) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }

          const baseDirs = [
            resolve(process.cwd(), "src/pages"),
            resolve(process.cwd(), "src"),
          ];

          for (const base of baseDirs) {
            const filePath = resolve(base, cleanUrl.slice(1));
            if (!filePath.startsWith(base)) continue;

            try {
              const data = await readFile(filePath);
              res.setHeader("Content-Type", "text/plain; charset=utf-8");
              res.setHeader("X-Content-Type-Options", "nosniff");
              res.end(data);
              return;
            } catch (e: unknown) {
              const err = e as NodeJS.ErrnoException;
              if (err.code !== "ENOENT") {
                console.error("[typress:router] Error reading file:", e);
              }
            }
          }
        }

        // Rewrite extensionless paths to .html for clean URLs.
        const accept = req.headers.accept || "";
        if (
          !cleanUrl.includes(".") &&
          !cleanUrl.endsWith("/") &&
          accept.includes("text/html")
        ) {
          req.url += ".html";
        }

        next();
      });
    },
  };
}
