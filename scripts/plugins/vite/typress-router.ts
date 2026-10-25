import { readFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve, sep } from "node:path";
import type { Plugin } from "vite";

/** Internal Vite and source prefixes excluded from clean HTML route rewriting. */
const INTERNAL_PATH_PREFIXES = [
  "/@",
  "/__",
  "/src/",
  "/scripts/",
  "/node_modules/",
];

/**
 * Dev-server middleware serving raw `.typ` source files with path-traversal protection and clean URL rewriting.
 *
 * @returns Configured Vite plugin instance.
 */
export function typressRouter(): Plugin {
  const cacheDir = resolve(process.cwd(), ".typress");

  return {
    name: "typress:router",

    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const rawUrl = req.url;
        if (!rawUrl) {
          next();
          return;
        }

        let parsedUrl: URL;
        let decodedPath: string;
        try {
          parsedUrl = new URL(rawUrl, "http://localhost");
          decodedPath = decodeURIComponent(parsedUrl.pathname);
        } catch {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }

        if (decodedPath.includes("\0")) {
          res.statusCode = 400;
          res.end("Bad Request");
          return;
        }

        // Serve raw .typ source files with strict directory boundary validation.
        if (decodedPath.endsWith(".typ")) {
          const segments = decodedPath.split(/[/\\]+/);
          if (segments.includes("..")) {
            res.statusCode = 403;
            res.end("Forbidden");
            return;
          }

          const relativeTarget = decodedPath.replace(/^[/\\]+/, "");
          const baseDirs = [
            resolve(process.cwd(), "src/pages"),
            resolve(process.cwd(), "src"),
          ];

          for (const base of baseDirs) {
            const filePath = resolve(base, relativeTarget);
            const baseWithSep = base.endsWith(sep) ? base : `${base}${sep}`;
            if (!filePath.startsWith(baseWithSep)) continue;

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

          res.statusCode = 404;
          res.end("Not Found");
          return;
        }

        // Rewrite extensionless and trailing-slash HTML requests while preserving query parameters.
        const isInternal = INTERNAL_PATH_PREFIXES.some((prefix) =>
          decodedPath.startsWith(prefix),
        );
        const accept = req.headers.accept ?? "";
        const acceptsHtml =
          accept.includes("text/html") || accept.includes("*/*");

        if (!isInternal && acceptsHtml && decodedPath !== "/") {
          const stripped = decodedPath.replace(/\/+$/, "");
          if (!stripped.includes(".")) {
            const candidateHtml = resolve(
              cacheDir,
              `${stripped.replace(/^\/+/, "")}.html`,
            );
            if (existsSync(candidateHtml)) {
              req.url = `${stripped}.html${parsedUrl.search}`;
            }
          }
        }

        next();
      });
    },
  };
}
